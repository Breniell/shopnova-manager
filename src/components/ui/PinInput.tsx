import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: boolean;
  onReset?: () => void;
}

export const PinInput: React.FC<PinInputProps> = ({ length = 4, onComplete, error = false, onReset }) => {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (error) {
      setTimeout(() => {
        setValues(Array(length).fill(''));
        inputsRef.current[0]?.focus();
        onReset?.();
      }, 600);
    }
  }, [error, length, onReset]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newValues = [...values];
    newValues[index] = value.slice(-1);
    setValues(newValues);

    if (value && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    if (newValues.every(v => v !== '') && newValues.join('').length === length) {
      onComplete(newValues.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className={cn('flex gap-3 justify-center', error && 'pin-shake')}>
      {values.map((val, i) => (
        <div key={i} className={cn(
          'w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all duration-150',
          val ? 'border-primary bg-primary/10' : 'border-border bg-muted',
          error && 'border-red-500 bg-red-500/10'
        )}>
          <input
            ref={el => { inputsRef.current[i] = el; }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={val}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className="w-full h-full bg-transparent text-center text-2xl font-bold text-foreground outline-none"
          />
        </div>
      ))}
    </div>
  );
};
