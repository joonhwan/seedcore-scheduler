import { describe, expect, it } from 'vitest';
import { UpdateMeDto } from './index';

/**
 * 본인이 직접 입력하는 자리라서, 관리자 경로(UpdateUserDto)와 달리 앞뒤 공백을 떼고 받는다.
 * 공백만 넣은 이름이 통과하면 화면 곳곳에서 이름 칸이 빈 채로 보인다.
 */
describe('UpdateMeDto', () => {
  it('앞뒤 공백을 떼어 낸다', () => {
    const parsed = UpdateMeDto.parse({ displayName: '  홍길동  ' });
    expect(parsed.displayName).toBe('홍길동');
  });

  it('공백만 넣으면 거부한다', () => {
    expect(UpdateMeDto.safeParse({ displayName: '   ' }).success).toBe(false);
  });

  it('빈 문자열을 거부한다', () => {
    expect(UpdateMeDto.safeParse({ displayName: '' }).success).toBe(false);
  });

  it('128자를 넘기면 거부한다', () => {
    expect(UpdateMeDto.safeParse({ displayName: 'ㄱ'.repeat(129) }).success).toBe(false);
    expect(UpdateMeDto.safeParse({ displayName: 'ㄱ'.repeat(128) }).success).toBe(true);
  });
});
