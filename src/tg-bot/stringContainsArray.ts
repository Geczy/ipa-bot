export function stringContainsArray(string: string, array: string[]) {
  for (let i = 0; i < array.length; i++) {
    if (string.includes(array[i])) {
      return true;
    }
  }
  return false;
}
