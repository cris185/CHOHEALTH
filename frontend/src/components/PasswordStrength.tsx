'use client';

import { Check, X } from 'lucide-react';

interface PasswordStrengthProps {
  password: string;
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const passwordStrength = {
    hasMinLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };

  const strengthScore = Object.values(passwordStrength).filter(Boolean).length;
  const percent = (strengthScore / 4) * 100;

  const getBarColor = () => {
    if (percent <= 25) return 'bg-red-500';
    if (percent <= 50) return 'bg-orange-500';
    if (percent <= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const requirements = [
    { key: 'hasMinLength', label: 'At least 8 characters', valid: passwordStrength.hasMinLength },
    { key: 'hasUpperCase', label: '1 uppercase letter', valid: passwordStrength.hasUpperCase },
    { key: 'hasLowerCase', label: '1 lowercase letter', valid: passwordStrength.hasLowerCase },
    { key: 'hasNumber', label: '1 number', valid: passwordStrength.hasNumber },
  ];

  if (!password) return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="h-1 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-in-out ${getBarColor()}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="space-y-1 text-xs">
        {requirements.map((req) => (
          <li
            key={req.key}
            className={`flex items-center gap-2 ${req.valid ? 'text-green-600' : 'text-muted-foreground'}`}
          >
            {req.valid ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {req.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
