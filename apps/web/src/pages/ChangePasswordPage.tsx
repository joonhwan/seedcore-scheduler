import { useNavigate } from 'react-router-dom';
import PasswordChangeForm from '../components/PasswordChangeForm';
import { useMe } from '../lib/auth';

/**
 * 첫 로그인이거나 관리자가 비밀번호를 재설정한 뒤 강제로 들르는 화면.
 *
 * RequireAuth(App.tsx)가 passwordMustChange 인 사람을 이 경로로 보내므로 경로를 바꾸면
 * 안 된다. 평소에 스스로 바꾸는 자리는 내 정보 화면(/me)이다. 폼 자체는 두 화면이
 * PasswordChangeForm 하나를 함께 쓴다.
 */
export default function ChangePasswordPage() {
  const me = useMe();
  const navigate = useNavigate();

  return (
    <main className="mx-auto mt-16 w-full max-w-sm rounded-lg border border-slate-200 p-6 dark:border-slate-700">
      <h1 className="text-xl font-bold">비밀번호 변경</h1>
      {me.data?.passwordMustChange && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          첫 로그인이거나 관리자가 비밀번호를 재설정했습니다. 변경 후 다시 로그인해 주세요.
        </p>
      )}
      <PasswordChangeForm
        username={me.data?.username ?? ''}
        onSuccess={() => navigate('/', { replace: true })}
      />
    </main>
  );
}
