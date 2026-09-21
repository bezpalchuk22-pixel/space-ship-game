const ACCELERATION = 280;
const MAX_SPEED = 500;
const ROTATION_SPEED = 3.5;
const FRICTION = 0.985;

function wrap(value, max) {
    if (value < 0) {
        return value + max;
    }

    if (value >= max) {
        return value - max;
    }

    return value;
}

export function integrate(ship, input, dt, width, height) {
    if (input.forward) {
        ship.vx +=
            Math.cos(ship.angle) *
            ACCELERATION *
            dt;

        ship.vy +=
            Math.sin(ship.angle) *
            ACCELERATION *
            dt;
    }

    if (input.backward) {
        ship.vx -=
            Math.cos(ship.angle) *
            ACCELERATION *
            0.5 *
            dt;

        ship.vy -=
            Math.sin(ship.angle) *
            ACCELERATION *
            0.5 *
            dt;
    }

    if (input.left) {
        ship.angle -= ROTATION_SPEED * dt;
    }

    if (input.right) {
        ship.angle += ROTATION_SPEED * dt;
    }

    const speed = Math.sqrt(
        ship.vx * ship.vx +
        ship.vy * ship.vy,
    );

    if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;

        ship.vx *= scale;
        ship.vy *= scale;
    }

    ship.vx *= Math.pow(
        FRICTION,
        dt * 60,
    );

    ship.vy *= Math.pow(
        FRICTION,
        dt * 60,
    );

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    ship.x = wrap(ship.x, width);
    ship.y = wrap(ship.y, height);
}