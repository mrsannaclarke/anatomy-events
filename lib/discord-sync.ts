const MAX_DISCORD_CONTENT_LENGTH = 1900;

function trimToDiscordLimit(value: string): string {
  const text = String(value || '').trim();
  if (text.length <= MAX_DISCORD_CONTENT_LENGTH) return text;
  return `${text.slice(0, MAX_DISCORD_CONTENT_LENGTH - 1).trimEnd()}…`;
}

export async function postDiscordWebhookMessage(input: {
  webhookUrl: string;
  content: string;
  username?: string;
}): Promise<void> {
  const webhookUrl = String(input.webhookUrl || '').trim();
  if (!/^https:\/\/discord\.com\/api\/webhooks\/\d+\//i.test(webhookUrl)) {
    throw new Error('Invalid Discord webhook URL.');
  }

  const content = trimToDiscordLimit(input.content);
  if (!content) {
    throw new Error('Discord message content is empty.');
  }

  const payload: {
    content: string;
    username?: string;
    allowed_mentions: { parse: string[] };
  } = {
    content,
    allowed_mentions: { parse: [] },
  };
  const username = String(input.username || '').trim();
  if (username) payload.username = username;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const detail = text.trim().slice(0, 180);
    throw new Error(detail ? `Discord webhook failed (${response.status}): ${detail}` : `Discord webhook failed (${response.status}).`);
  }
}
