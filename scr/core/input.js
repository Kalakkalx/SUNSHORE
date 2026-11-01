const KEY_DIRECTIONS = new Map([
  ["KeyW", "n"],
  ["ArrowUp", "n"],
  ["KeyS", "s"],
  ["ArrowDown", "s"],
  ["KeyA", "w"],
  ["ArrowLeft", "w"],
  ["KeyD", "e"],
  ["ArrowRight", "e"]
]);
const ACTION_KEYS = new Map([
  ["KeyH", "horn"], ["KeyL", "headlights"], ["KeyG", "garage"],
  ["KeyM", "map"], ["KeyR", "radio"]
]);

export class InputController {
  constructor(root) {
    this.root = root;
    this.keys = new Set();
    this.touches = new Set();
    this.directionButtons = Array.from(root.querySelectorAll("[data-direction]"));
    this.interactButton = root.querySelector("[data-interact]");
    this.lastForwardPress = -Infinity;
    this.sprintActive = false;
    this.jumpQueued = false;
    this.interactQueued = false;
    this.actions = new Set();
    this.directionButtons.forEach((button) => {
      button.setAttribute("aria-label", getDirectionLabel(button.dataset.direction));
    });
    this.actionButtons = Array.from(root.querySelectorAll("[data-action]"));

    this.onKeyDown = (event) => {
      if (event.code === "KeyE") {
        event.preventDefault();

        if (!event.repeat) {
          this.interactQueued = true;
        }

        return;
      }

      if (event.code === "Space") {
        event.preventDefault();

        if (!event.repeat) {
          this.jumpQueued = true;
        }

        return;
      }

      if (ACTION_KEYS.has(event.code)) {
        event.preventDefault();
        if (!event.repeat) this.actions.add(ACTION_KEYS.get(event.code));
        return;
      }

      if (!KEY_DIRECTIONS.has(event.code)) {
        return;
      }

      event.preventDefault();
      const direction = KEY_DIRECTIONS.get(event.code);

      if (!this.keys.has(event.code) && !event.repeat) {
        if (direction.includes("n") && !this.hasForwardInput()) {
          this.onDirectionPressed(direction);
        }
      }

      this.keys.add(event.code);
    };

    this.onKeyUp = (event) => {
      const direction = KEY_DIRECTIONS.get(event.code);

      if (direction) {
        this.keys.delete(event.code);
        this.clearSprintIfForwardReleased();
      }
    };

    this.onBlur = () => {
      this.clear();
    };

    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.bindTouchControls();
  }

  clear() {
    this.keys.clear();
    this.touches.clear();
    this.sprintActive = false;
    this.jumpQueued = false;
    this.interactQueued = false;
    this.actions.clear();
    this.directionButtons.forEach((button) => button.classList.remove("is-pressed"));
    this.interactButton?.classList.remove("is-pressed");
  }

  bindTouchControls() {
    if (this.interactButton) {
      this.interactButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.interactButton.setPointerCapture?.(event.pointerId);
        this.interactQueued = true;
        this.interactButton.classList.add("is-pressed");
      });
      this.interactButton.addEventListener("pointerup", () => {
        this.interactButton.classList.remove("is-pressed");
      });
      this.interactButton.addEventListener("pointercancel", () => {
        this.interactButton.classList.remove("is-pressed");
      });
    }

    for (const button of this.actionButtons) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.actions.add(button.dataset.action);
      });
    }

    for (const button of this.directionButtons) {
      const direction = button.dataset.direction;
      const press = (event) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        button.classList.add("is-pressed");

        if (!this.touches.has(direction) &&
            direction.includes("n") &&
            !this.hasForwardInput()) {
          this.onDirectionPressed(direction);
        }

        this.touches.add(direction);
      };
      const release = (event) => {
        event.preventDefault();
        button.classList.remove("is-pressed");
        this.touches.delete(direction);
        this.clearSprintIfForwardReleased();
      };

      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    }
  }

  onDirectionPressed(direction) {
    if (!direction.includes("n")) {
      return;
    }

    const now = performance.now();
    this.sprintActive = now - this.lastForwardPress <= 340;
    this.lastForwardPress = now;
  }

  clearSprintIfForwardReleased() {
    if (!this.hasForwardInput()) {
      this.sprintActive = false;
    }
  }

  hasForwardInput() {
    return this.getActiveDirections().some((direction) => direction.includes("n"));
  }

  getActiveDirections() {
    const keyboard = [...this.keys].map((code) => KEY_DIRECTIONS.get(code));
    return keyboard.concat([...this.touches]);
  }

  getControls() {
    let forward = 0;
    let turn = 0;

    for (const direction of new Set(this.getActiveDirections())) {
      if (direction.includes("n")) forward += 1;
      if (direction.includes("s")) forward -= 1;
      if (direction.includes("w")) turn += 1;
      if (direction.includes("e")) turn -= 1;
    }

    forward = Math.max(-1, Math.min(1, forward));
    turn = Math.max(-1, Math.min(1, turn));

    return {
      forward,
      turn,
      sprinting: forward > 0 && this.sprintActive
    };
  }

  consumeJumpRequest() {
    const requested = this.jumpQueued;
    this.jumpQueued = false;
    return requested;
  }

  consumeInteractRequest() {
    const requested = this.interactQueued;
    this.interactQueued = false;
    return requested;
  }

  consumeAction(action) {
    if (!this.actions.has(action)) return false;
    this.actions.delete(action);
    return true;
  }
}

function getDirectionLabel(direction) {
  const labels = {
    nw: "Move forward and turn left",
    n: "Move forward",
    ne: "Move forward and turn right",
    w: "Turn left",
    e: "Turn right",
    sw: "Move backward and turn left",
    s: "Move backward",
    se: "Move backward and turn right"
  };

  return labels[direction] ?? "Move";
}
