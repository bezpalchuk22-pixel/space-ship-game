import { test, expect, type Page } from "@playwright/test";

type SnapshotPlayer = {
    id: string;
    x: number;
    y: number;
};

type JsonFrame = {
    type?: string;
    playerId?: string;
    players?: SnapshotPlayer[];
    text?: string;
};

function observeJsonFrames(page: Page, frames: JsonFrame[]): void {
    page.on("websocket", socket => {
        socket.on("framereceived", frame => {
            const payload = frame.payload;
            const raw = typeof payload === "string"
                ? payload
                : payload.toString();

            try {
                const parsed: unknown = JSON.parse(raw);

                if (
                    typeof parsed === "object" &&
                    parsed !== null &&
                    "type" in parsed
                ) {
                    frames.push(parsed as JsonFrame);
                }
            } catch {
                // Ігноруємо не-JSON кадри.
            }
        });
    });
}

function getLatestSnapshot(
    frames: JsonFrame[]
): JsonFrame | undefined {
    return [...frames]
        .reverse()
        .find(frame => frame.type === "snapshot");
}

test("two players can move and exchange chat messages", async ({
    browser
}) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    try {
        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        const frames1: JsonFrame[] = [];
        const frames2: JsonFrame[] = [];

        observeJsonFrames(page1, frames1);
        observeJsonFrames(page2, frames2);

        // Перший гравець створює кімнату.
        await page1.goto("/");
        await page1.locator("#lobby-player-name").fill("Player One");
        await page1.locator("#lobby-protocol").selectOption("json");
        await page1.locator("#lobby-room-name").fill("E2E Multiplayer Room");
        await page1.locator("#lobby-create").click();

        await expect(page1.locator(".lobby__status"))
            .toContainText("створено");

        const roomId = await page1.locator("#lobby-rooms").inputValue();

        await page1.locator("#lobby-join").click();
        await expect(page1.locator("#chat-input")).toBeVisible();

        // Другий гравець приєднується до тієї самої кімнати.
        await page2.goto("/");
        await page2.locator("#lobby-player-name").fill("Player Two");
        await page2.locator("#lobby-protocol").selectOption("json");

        await expect.poll(() =>
            page2.locator(`#lobby-rooms option[value="${roomId}"]`).count()
        ).toBe(1);

        await page2.locator("#lobby-rooms").selectOption(roomId);
        await page2.locator("#lobby-join").click();

        await expect(page2.locator("#chat-input")).toBeVisible();

        // Отримуємо ID першого гравця.
        await expect.poll(() =>
            frames1.find(frame => frame.type === "joined")?.playerId ?? ""
        ).not.toBe("");

        const firstPlayerId = frames1.find(
            frame => frame.type === "joined"
        )!.playerId!;

        // Другий клієнт повинен отримати snapshot із двома гравцями.
        await expect.poll(() => {
            return getLatestSnapshot(frames2)?.players?.length ?? 0;
        }).toBeGreaterThanOrEqual(2);

        const initialPlayer = getLatestSnapshot(frames2)!
            .players!
            .find(player => player.id === firstPlayerId);

        expect(initialPlayer).toBeDefined();

        const initialX = initialPlayer!.x;
        const initialY = initialPlayer!.y;

        // Утримуємо W, щоб перший гравець рухався вперед.
        await page1.keyboard.down("w");

        try {
            // Перевіряємо, що другий клієнт бачить зміну координат.
            await expect.poll(() => {
                const player = getLatestSnapshot(frames2)
                    ?.players
                    ?.find(item => item.id === firstPlayerId);

                if (!player) {
                    return false;
                }

                const distance = Math.hypot(
                    player.x - initialX,
                    player.y - initialY
                );

                return distance > 2;
            }, {
                timeout: 15_000,
                intervals: [100, 250, 500]
            }).toBe(true);
        } finally {
            await page1.keyboard.up("w");
        }

        // Перший гравець надсилає повідомлення.
        const chatText = "Hello from Player One";

        await page1.locator("#chat-input").fill(chatText);
        await page1.locator("#chat-input").press("Enter");

        // Повідомлення має з'явитися в обох клієнтів.
        await expect(page1.locator("#chat-messages"))
            .toContainText(chatText);

        await expect(page2.locator("#chat-messages"))
            .toContainText(chatText);
    } finally {
        await context1.close();
        await context2.close();
    }
});
