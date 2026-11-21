
export class LobbyUI {
    constructor(lobby, root = document.body) {
        this.lobby = lobby;
        this.root = root;
        this.selectedRoomId = null;

        this.element = document.createElement("section");
        this.element.className = "lobby";

        this.element.innerHTML = `
            <div class="lobby__panel">
                <h1>SPACE SHIP</h1>
                <p>Лобі перед початком гри</p>

                <label for="lobby-player-name">Ім'я гравця</label>
                <input
                    id="lobby-player-name"
                    type="text"
                    maxlength="24"
                    placeholder="Введіть ім'я"
                    autocomplete="nickname"
                />

                <label for="lobby-protocol">Мережевий протокол</label>
                <select id="lobby-protocol">
                    <option value="binary" selected>Binary</option>
                    <option value="json">JSON</option>
                </select>

                <label for="lobby-rooms">Оберіть кімнату</label>
                <select id="lobby-rooms">
                    <option value="">Завантаження кімнат...</option>
                </select>

                <label for="lobby-room-name">Назва нової кімнати</label>
                <input
                    id="lobby-room-name"
                    type="text"
                    maxlength="40"
                    placeholder="Наприклад, Кімната 2"
                />

                <button type="button" id="lobby-create">
                    Створити кімнату
                </button>

                <p class="lobby__status" role="status" aria-live="polite">
                    Завантаження списку кімнат...
                </p>

                <button type="button" id="lobby-join" disabled>
                    Приєднатися до гри
                </button>
            </div>
        `;

        this.nameInput = this.element.querySelector("#lobby-player-name");
        this.protocolSelect = this.element.querySelector("#lobby-protocol");
        this.roomsSelect = this.element.querySelector("#lobby-rooms");
        this.roomNameInput = this.element.querySelector("#lobby-room-name");
        this.createButton = this.element.querySelector("#lobby-create");
        this.status = this.element.querySelector(".lobby__status");
        this.joinButton = this.element.querySelector("#lobby-join");

        this.onRoomsUpdated = event => {
            this.renderRooms(event.detail.rooms);
        };

        this.onRoomsError = event => {
            this.status.textContent =
                `Не вдалося завантажити кімнати: ${event.detail.message}`;
            this.addRetryOption();
        };

        this.onLobbyError = event => {
            this.status.textContent = event.detail.message;
        };

        this.onJoin = event => {
            this.element.hidden = true;
            this.status.textContent =
                `Гравець ${event.detail.playerName} приєднався до кімнати ${event.detail.room.name}.`;
        };

        this.onSelectionChange = () => {
            this.selectedRoomId = this.roomsSelect.value;
            this.updateJoinButton();
        };

        this.onJoinClick = () => {
            this.lobby.join(
                this.nameInput.value,
                this.roomsSelect.value
            );
        };

        this.onCreateClick = async () => {
            const name = this.roomNameInput.value.trim();

            if (!name) {
                this.status.textContent = "Введіть назву кімнати.";
                this.roomNameInput.focus();
                return;
            }

            this.createButton.disabled = true;

            try {
                const response = await fetch(this.lobby.roomsUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ name })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `HTTP ${response.status}`);
                }

                if (!data.room || data.room.id === undefined) {
                    throw new Error("Сервер повернув некоректні дані кімнати.");
                }

                this.roomNameInput.value = "";
                await this.lobby.refreshRooms();

                const createdRoomId = String(data.room.id);

                const roomExists = this.lobby.rooms.some(
                    room => String(room.id) === createdRoomId
                );

                if (roomExists) {
                    this.roomsSelect.value = createdRoomId;
                    this.selectedRoomId = createdRoomId;
                }

                this.updateJoinButton();
                this.status.textContent =
                    `Кімнату «${data.room.name}» створено.`;
            } catch (error) {
                this.status.textContent =
                    `Не вдалося створити кімнату: ${error.message}`;
            } finally {
                this.createButton.disabled = false;
            }
        };

        this.onNameInput = () => {
            this.updateJoinButton();
        };

        this.lobby.addEventListener("roomsUpdated", this.onRoomsUpdated);
        this.lobby.addEventListener("roomsError", this.onRoomsError);
        this.lobby.addEventListener("lobbyError", this.onLobbyError);
        this.lobby.addEventListener("join", this.onJoin);

        this.roomsSelect.addEventListener("change", this.onSelectionChange);
        this.nameInput.addEventListener("input", this.onNameInput);
        this.joinButton.addEventListener("click", this.onJoinClick);
        this.createButton.addEventListener("click", this.onCreateClick);

        this.root.appendChild(this.element);
    }

    renderRooms(rooms) {
        const previousValue = this.roomsSelect.value;

        this.roomsSelect.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = rooms.length
            ? "Оберіть кімнату"
            : "Кімнат поки немає";

        this.roomsSelect.appendChild(placeholder);

        for (const room of rooms) {
            const option = document.createElement("option");
            option.value = String(room.id);
            option.textContent =
                `${room.name} — ${room.players}/${room.maxPlayers} гравців`;

            this.roomsSelect.appendChild(option);
        }

        const stillExists = rooms.some(
            room => String(room.id) === previousValue
        );

        this.roomsSelect.value = stillExists ? previousValue : "";
        this.selectedRoomId = this.roomsSelect.value;

        this.status.textContent = `Доступно кімнат: ${rooms.length}`;
        this.updateJoinButton();
    }

    addRetryOption() {
        this.roomsSelect.replaceChildren();

        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Список кімнат недоступний";

        this.roomsSelect.appendChild(option);
        this.joinButton.disabled = true;
    }

    updateJoinButton() {
        this.joinButton.disabled =
            !this.nameInput.value.trim() ||
            !this.roomsSelect.value;
    }

    show() {
        this.element.hidden = false;
        this.lobby.start();
    }

    hide() {
        this.element.hidden = true;
        this.lobby.stop();
    }

    destroy() {
        this.lobby.removeEventListener("roomsUpdated", this.onRoomsUpdated);
        this.lobby.removeEventListener("roomsError", this.onRoomsError);
        this.lobby.removeEventListener("lobbyError", this.onLobbyError);
        this.lobby.removeEventListener("join", this.onJoin);

        this.roomsSelect.removeEventListener("change", this.onSelectionChange);
        this.nameInput.removeEventListener("input", this.onNameInput);
        this.joinButton.removeEventListener("click", this.onJoinClick);
        this.createButton.removeEventListener("click", this.onCreateClick);

        this.element.remove();
    }
}
