import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import App from './App';
import { configureApi } from './lib/api';
import './index.css';

/**
 * 창 전환도 "돌아왔다" 로 치게 한다.
 *
 * TanStack Query 가 기본으로 듣는 것은 `visibilitychange` 하나이고, 포커스 판정도
 * `document.visibilityState !== 'hidden'` 이다. 그런데 **브라우저 창이 다른 창에 가려져도
 * visibilityState 는 'visible' 로 남는다** — 'hidden' 이 되는 것은 다른 탭으로 바꾸거나 창을
 * 최소화할 때뿐이다. 즉 창을 가리거나 다시 앞으로 가져오는 동작은 이벤트를 하나도 일으키지
 * 않아서, refetchOnWindowFocus 가 이름과 달리 창 전환에는 반응하지 않는다.
 *
 * 여기에 브라우저가 가려진 창의 타이머를 억제하는 것이 겹치면, 주기적으로 다시 받는 질의가
 * 창을 다시 볼 때까지 옛 값에 머문다. 재시작 예고 팝업이 강제 새로고침 없이는 뜨지 않던 것이
 * 이 조합 때문이었다.
 *
 * window 의 focus 를 함께 들어 창을 앞으로 가져오는 순간 다시 받게 한다. 이 저장소의 전역
 * 기본값은 `refetchOnWindowFocus: false` 이므로, **이 이벤트로 다시 받는 것은 그 옵션을 개별로
 * 켠 질의뿐이다**(지금은 useActiveServerNotice 하나). 다른 질의에 같은 동작이 필요하면 그
 * 질의에 옵션을 켜야 한다.
 */
focusManager.setEventListener((handleFocus) => {
  const onFocus = () => handleFocus();
  window.addEventListener('visibilitychange', onFocus, false);
  window.addEventListener('focus', onFocus, false);
  return () => {
    window.removeEventListener('visibilitychange', onFocus);
    window.removeEventListener('focus', onFocus);
  };
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

configureApi({
  onUnauthorized: () => {
    queryClient.setQueryData(['auth', 'me'], null);
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
