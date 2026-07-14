import { useState, useRef, useEffect } from 'react';
import { useAutocompleteTerms } from '../lib/autocomplete';

interface Props {
  kind: 'GROUP' | 'ITEM';
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}

export default function AutocompleteInput({
  kind,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  className,
  inputRef,
  onKeyDown,
  autoFocus,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // inputRef가 외부에서 올 수도 있고 내부에서 생성할 수도 있으므로 fallback 마련
  const localInputRef = useRef<HTMLInputElement>(null);
  const activeInputRef = inputRef || localInputRef;

  // 전체 자동완성 목록 조회 (이 프로젝트는 150명 이하, 노드 5000개 이내라 모든 자동완성 목록을 클라이언트에 캐싱해도 메모리 부담이 아주 적음)
  const { data: terms = [] } = useAutocompleteTerms({ kind });

  // 검색어에 따른 필터링 (사용자가 입력 중일 때 매칭되는 후보군 선별)
  const cleanVal = value.trim().toLowerCase();
  const filtered = terms
    .filter((t) => {
      if (!cleanVal) return true; // 비어있을 때는 상위 후보군 전체 표시
      return t.title.toLowerCase().includes(cleanVal);
    })
    .slice(0, 10); // 최대 10개만 추천

  // 클릭 이벤트가 컴포넌트 바깥에서 일어나면 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // filtered 후보군이 바뀌면 highlightedIndex 초기화
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [value, isOpen]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isOpen && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          e.preventDefault();
          selectTerm(filtered[highlightedIndex]!.title);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    }
    
    // 외부 KeyDown 핸들러 전달 (Enter로 최종 제출되는 등의 동작 유지)
    if (onKeyDown) {
      onKeyDown(e);
    }
  }

  function selectTerm(title: string) {
    onChange(title);
    setIsOpen(false);
    // 선택 후 input 포커스 유지
    activeInputRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={activeInputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        autoFocus={autoFocus}
        className={className}
      />
      {isOpen && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
          {filtered.map((item, idx) => (
            <li
              key={item.id}
              // onMouseDown은 click이 발생해 focusout이 되기 전에 핸들링할 수 있음
              onMouseDown={(e) => {
                e.preventDefault();
                selectTerm(item.title);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`cursor-pointer px-3 py-1.5 text-sm transition-colors flex items-center justify-between ${
                idx === highlightedIndex
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
              }`}
            >
              <span className="truncate">{item.title}</span>
              {item.isSystem ? (
                <span className={`text-[9px] px-1 rounded font-semibold shrink-0 ${
                  idx === highlightedIndex 
                    ? 'bg-white/20 text-white' 
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  초기
                </span>
              ) : (
                <span className={`text-[9px] px-1 rounded font-semibold shrink-0 ${
                  idx === highlightedIndex 
                    ? 'bg-white/20 text-white' 
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400'
                }`}>
                  수집
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
