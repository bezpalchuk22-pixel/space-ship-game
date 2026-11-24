
export class Vector2 {
    constructor(
        public readonly x: number = 0,
        public readonly y: number = 0
    ) { }

    add(other: Vector2): Vector2 {
        return new Vector2(
            this.x + other.x,
            this.y + other.y
        );
    }

    subtract(other: Vector2): Vector2 {
        return new Vector2(
            this.x - other.x,
            this.y - other.y
        );
    }

    multiply(scalar: number): Vector2 {
        return new Vector2(
            this.x * scalar,
            this.y * scalar
        );
    }

    get length(): number {
        return Math.hypot(this.x, this.y);
    }

    normalize(): Vector2 {
        const scale = Math.max(
            Math.abs(this.x),
            Math.abs(this.y)
        );

        if (scale === 0) {
            return new Vector2(0, 0);
        }

        const scaledX = this.x / scale;
        const scaledY = this.y / scale;
        const length = Math.hypot(scaledX, scaledY);

        return new Vector2(
            scaledX / length,
            scaledY / length
        );
    }

    distanceTo(other: Vector2): number {
        return Math.hypot(
            this.x - other.x,
            this.y - other.y
        );
    }

    static fromAngle(
        angle: number,
        magnitude: number = 1
    ): Vector2 {
        return new Vector2(
            Math.cos(angle) * magnitude,
            Math.sin(angle) * magnitude
        );
    }
}
