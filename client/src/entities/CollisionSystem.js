
export class CollisionSystem {
    check(world) {
        const entities = [...world.entities.values()];

        for (let i = 0; i < entities.length; i++) {
            const a = entities[i];
            if (a.dead) continue;

            for (let j = i + 1; j < entities.length; j++) {
                const b = entities[j];
                if (b.dead) continue;

                const dx = a.position.x - b.position.x;
                const dy = a.position.y - b.position.y;
                const distance = Math.hypot(dx, dy);

                if (distance <= a.radius + b.radius) {
                    this.resolve(world, a, b);
                }
            }
        }
    }

    resolve(world, a, b) {
        const bullet =
            a.kind === "bullet" ? a :
                b.kind === "bullet" ? b : null;

        if (bullet) {
            const other = bullet === a ? b : a;

            if (other.id === bullet.ownerId) return;

            if (other.kind === "asteroid") {
                const position = { ...other.position };

                if (typeof other.split === "function") {
                    other.split(world);
                } else {
                    other.destroy();
                }

                bullet.destroy();
                world.score += 10;
                world.explode(position);
            } else if (other.kind === "ship") {
                if (typeof other.takeDamage === "function") {
                    other.takeDamage(25);
                }

                bullet.destroy();
                world.explode(bullet.position, 4);
            }

            return;
        }

        const ship =
            a.kind === "ship" ? a :
                b.kind === "ship" ? b : null;

        const pickup =
            a.kind === "pickup" ? a :
                b.kind === "pickup" ? b : null;

        if (ship && pickup && !ship.dead && !pickup.dead) {
            if (typeof ship.heal === "function") {
                ship.heal(25);
            }

            pickup.destroy();
            world.score += 5;
            return;
        }

        const asteroid =
            a.kind === "asteroid" ? a :
                b.kind === "asteroid" ? b : null;

        if (ship && asteroid && !ship.dead && !asteroid.dead) {
            const position = { ...asteroid.position };

            if (typeof ship.takeDamage === "function") {
                ship.takeDamage(20);
            }

            asteroid.destroy();
            world.explode(position);
        }
    }
}
