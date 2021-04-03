import watcher from '@parcel/watcher';

export const getEvent = (events: watcher.Event[]) => {
  return {
    count: events.length,
    deleted: events.filter(event => event.type === 'delete')
      .map(event => event.path),
    updated: events.filter(event => event.type === 'create' || event.type === 'update')
      .map(event => event.path),
  };
}
