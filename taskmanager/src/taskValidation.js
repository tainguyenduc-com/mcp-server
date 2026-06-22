import { VALID_STATUSES, VALID_PRIORITIES, VALID_TRANSITIONS } from "./constants.js";

export { VALID_STATUSES, VALID_PRIORITIES, VALID_TRANSITIONS };

export function isValidTransition(currentStatus, newStatus) {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}
