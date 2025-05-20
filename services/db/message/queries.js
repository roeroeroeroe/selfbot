export const COPY_MESSAGES_STREAM = `
COPY messages (channel_id, user_id, text, timestamp)
FROM STDIN WITH (FORMAT text)`;
