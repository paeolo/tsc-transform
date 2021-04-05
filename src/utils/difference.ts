export const difference = <T>(first: T[], second: T[]) => {
  const out = [];
  let idx = 0;
  const firstLen = first.length;
  const secondLen = second.length;
  const toFilterOut = new Set<T>();

  const hasOrAdd = (item: T) => {
    if (toFilterOut.has(item)) {
      return false;
    }
    else {
      toFilterOut.add(item);
      return true;
    }
  };

  for (let i = 0; i < secondLen; i += 1) {
    hasOrAdd(second[i]);
  }

  while (idx < firstLen) {
    if (hasOrAdd(first[idx])) {
      out[out.length] = first[idx];
    }
    idx += 1;
  }
  return out;
};
