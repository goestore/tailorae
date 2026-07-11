'use client';

import React from 'react';
import { Button } from '@/components/common';

export interface AuthFormProps {
  onSubmit: (data: Record<string, string>) => Promise<void>;
  fields: Array<{
    name: string;
    label: string;
    type: 'text' | 'email' | 'password' | 'tel';
    placeholder: string;
    required?: boolean;
  }>;
  submitButtonText?: string;
  isLoading?: boolean;
  error?: string;
}

export const AuthForm: React.FC<AuthFormProps> = ({
  onSubmit,
  fields,
  submitButtonText = 'Submit',
  isLoading = false,
  error,
}) => {
  const [formData, setFormData] = React.useState<Record<string, string>>(
    fields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {})
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {fields.map((field) => (
        <div key={field.name}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {field.label}
          </label>
          <input
            type={field.type}
            name={field.name}
            placeholder={field.placeholder}
            value={formData[field.name]}
            onChange={handleChange}
            required={field.required}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      ))}

      <Button
        type="submit"
        fullWidth
        variant="primary"
        size="lg"
        disabled={isLoading}
      >
        {isLoading ? 'Processing...' : submitButtonText}
      </Button>
    </form>
  );
};
