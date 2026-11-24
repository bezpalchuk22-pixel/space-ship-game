export function allowMessage(
    messageTimes: number[],
    now: number,
    maxMessages = 60,
    windowMs = 1000
): boolean {
    const recentTimes = messageTimes.filter(
        time => now - time < windowMs
    );

    messageTimes.length = 0;
    messageTimes.push(...recentTimes);

    if (messageTimes.length >= maxMessages) {
        return false;
    }

    messageTimes.push(now);
    return true;
}
