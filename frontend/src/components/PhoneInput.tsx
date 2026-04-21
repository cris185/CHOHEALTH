'use client';

import PhoneInput2 from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  country?: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function PhoneInput({
  value,
  onChange,
  country = 'us',
  placeholder,
  disabled,
}: PhoneInputProps) {
  return (
    <PhoneInput2
      country={country}
      value={value}
      onChange={(phone) => onChange(phone)}
      placeholder={placeholder}
      disabled={disabled}
      enableSearch
      searchPlaceholder="Search country..."
      inputClass="!w-full !h-10 !text-sm !rounded-md !border !border-input !bg-transparent !pl-12 !pr-3"
      buttonClass="!border !border-input !rounded-l-md !bg-transparent"
      containerClass="!w-full"
      dropdownClass="!text-sm"
    />
  );
}
