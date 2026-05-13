const SAO_PAULO_OFFSET = '-03:00';

const pad = (value: number) => String(value).padStart(2, '0');

const getDateParts = (date: Date) => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
});

const toSaoPauloIso = (date: Date, time: string) => {
  const { year, month, day } = getDateParts(date);
  return new Date(`${year}-${pad(month)}-${pad(day)}T${time}${SAO_PAULO_OFFSET}`).toISOString();
};

export const toSaoPauloStartOfDayIso = (date: Date | undefined) =>
  date ? toSaoPauloIso(date, '00:00:00.000') : null;

export const toSaoPauloEndOfDayIso = (date: Date | undefined) =>
  date ? toSaoPauloIso(date, '23:59:59.999') : null;