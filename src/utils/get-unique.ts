import {
  FSEvent
} from "../types";

export const getUniqueOutOfDateFilePath = (events: FSEvent) => {
  return events.deleted.length === 0 && events.updated.length === 1
    ? events.updated[0]
    : undefined;
}
