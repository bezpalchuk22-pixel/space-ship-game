
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

        <label for="lobby-rooms">Оберіть кімнату</label>
        <select id="lobby-rooms">
          <option value="">Завантаження кімнат...</option>
        </select>

        <p class="lobby__status" role="status" aria-live="polite">
          Завантаження списку кімнат...
        </p>

        <button type="button" id="lobby-join" disabled>
          Join
        </button>
      </div>
    `;

        this.nameInput = this.element.querySelector("#lobby-player-name");
        this.roomsSelect = this.element.querySelector("#lobby-rooms");
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

        this.onNameInput = () => {
            this.updateJoinButton();
        };

        this.lobby.addEventListener("roomsUpdated", this.onRoomsUpdated);
        this.lobby.addEventListener("roomsError", this.onRoomsError);
        this.lobby.addEventListener("lobbyError", this.onLobbyError);
        this.lobby.addEventListener("join", this.onJoin);

        this.roomsSelect.addEventListener(
            "change",
            this.onSelectionChange
        );

        this.nameInput.addEventListener("input", this.onNameInput);
        this.joinButton.addEventListener("click", this.onJoinClick);

        this.root.appendChild(this.element);
    }

    renderRooms(rooms) {
        const previousValue = this.roomsSelect.value;

        this.roomsSelect.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Оберіть кімнату";
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

        if (stillExists) {
            this.roomsSelect.value = previousValue;
        } else {
            this.roomsSelect.value = "";
        }

        this.status.textContent =
            `Доступно кімнат: ${rooms.length}`;

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

        this.roomsSelect.removeEventListener(
            "change",
            this.onSelectionChange
        );

        this.nameInput.removeEventListener("input", this.onNameInput);
        this.joinButton.removeEventListener("click", this.onJoinClick);

        this.element.remove();
    }
}
