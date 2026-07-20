/** NodeHistory.diffJson 문자열을 안전하게 파싱한다. 객체가 아니면 빈 객체를 반환. */
export function parseDiff(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
