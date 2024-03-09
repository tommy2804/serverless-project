export const getTtlTime = (days: number): number => {
  const date = Date.now() / 1000;
  return Math.floor(date + 60 * 60 * 24 * days);
};
