export function createRenderer(canvas) {
    const context = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize() {
        dpr = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();

        width = rect.width;
        height = rect.height;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        context.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0,
        );
    }

    function drawBackground() {
        context.fillStyle = '#050816';

        context.fillRect(
            0,
            0,
            width,
            height,
        );

        context.strokeStyle =
            'rgba(255, 255, 255, 0.04)';

        context.lineWidth = 1;

        const gridSize = 50;

        for (
            let x = 0;
            x <= width;
            x += gridSize
        ) {
            context.beginPath();

            context.moveTo(x, 0);
            context.lineTo(x, height);

            context.stroke();
        }

        for (
            let y = 0;
            y <= height;
            y += gridSize
        ) {
            context.beginPath();

            context.moveTo(0, y);
            context.lineTo(width, y);

            context.stroke();
        }
    }

    function drawStars() {
        const stars = [
            [80, 70],
            [190, 140],
            [340, 90],
            [500, 180],
            [700, 70],
            [850, 160],
            [1000, 100],
            [1150, 210],
            [1250, 80],
            [420, 320],
            [760, 400],
            [1100, 350],
        ];

        context.fillStyle = '#ffffff';

        for (const [x, y] of stars) {
            if (x < width && y < height) {
                context.fillRect(
                    x,
                    y,
                    2,
                    2,
                );
            }
        }
    }

    function drawShip(ship) {
        context.save();

        context.translate(
            ship.renderX,
            ship.renderY,
        );

        context.rotate(ship.renderAngle);

        context.beginPath();

        context.moveTo(22, 0);
        context.lineTo(-14, -12);
        context.lineTo(-8, 0);
        context.lineTo(-14, 12);
        context.closePath();

        context.fillStyle = '#4cc9f0';
        context.fill();

        context.strokeStyle = '#ffffff';
        context.lineWidth = 2;
        context.stroke();

        if (ship.thrust) {
            context.beginPath();

            context.moveTo(-10, -5);
            context.lineTo(-25, 0);
            context.lineTo(-10, 5);
            context.closePath();

            context.fillStyle = '#ff9f1c';
            context.fill();
        }

        context.restore();
    }

    function render(ship, alpha) {
        drawBackground();
        drawStars();

        const renderX =
            ship.previousX +
            (ship.x - ship.previousX) *
            alpha;

        const renderY =
            ship.previousY +
            (ship.y - ship.previousY) *
            alpha;

        const renderAngle =
            ship.previousAngle +
            (ship.angle - ship.previousAngle) *
            alpha;

        ship.renderX = renderX;
        ship.renderY = renderY;
        ship.renderAngle = renderAngle;

        drawShip(ship);
    }

    window.addEventListener(
        'resize',
        resize,
    );

    resize();

    return {
        render,
        getWidth: () => width,
        getHeight: () => height,
        resize,
    };
}