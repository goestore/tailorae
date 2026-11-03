'use client';

import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * The category field builder's API (backend/src/routes/admin-category-fields.ts).
 *
 * Fields an admin defines on a category (Television: screen size, smart TV)
 * that sellers fill in for every product filed there or below, shoppers can
 * filter by, and the product page lists in its specification table.
 */

export type CategoryFieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTI_SELECT' | 'BOOLEAN';

export const FIELD_TYPE_LABELS: Record<CategoryFieldType, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  SELECT: 'Pick one',
  MULTI_SELECT: 'Pick several',
  BOOLEAN: 'Yes / no',
};

export interface CategoryField {
  id: string;
  categoryId: string;
  key: string;
  label: string;
  type: CategoryFieldType;
  options: string[];
  unit: string | null;
  helpText: string | null;
  required: boolean;
  filterable: boolean;
  displayOrder: number;
}

export interface InheritedField extends CategoryField {
  definedBy: { id: string; name: string };
}

export interface CategoryFieldsView {
  category: { id: string; name: string; optionLabel: string | null; optionValues: string[] };
  fields: CategoryField[];
  inherited: InheritedField[];
  inheritedOption: {
    optionLabel: string | null;
    optionValues: string[];
    labelFrom: { id: string; name: string } | null;
    valuesFrom: { id: string; name: string } | null;
  };
  template: {
    slug: string;
    articleType: string;
    family: 'apparel' | 'general';
    optionLabel: string;
    attributes: Array<{ key: string; label: string }>;
  } | null;
}

export type CategoryFieldInput = Partial<
  Pick<CategoryField, 'key' | 'label' | 'type' | 'options' | 'unit' | 'helpText' | 'required' | 'filterable'>
>;

const base = (categoryId: string) => `/admin/categories/${encodeURIComponent(categoryId)}`;

export async function getCategoryFields(categoryId: string): Promise<CategoryFieldsView> {
  try {
    const res = await apiClient.get(`${base(categoryId)}/fields`);
    return res.data?.data as CategoryFieldsView;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not load the category fields.'));
  }
}

export async function createCategoryField(categoryId: string, input: CategoryFieldInput): Promise<CategoryField> {
  try {
    const res = await apiClient.post(`${base(categoryId)}/fields`, input);
    return res.data?.data?.field as CategoryField;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not add the field.'));
  }
}

export async function updateCategoryField(
  categoryId: string,
  fieldId: string,
  input: CategoryFieldInput
): Promise<CategoryField> {
  try {
    const res = await apiClient.put(`${base(categoryId)}/fields/${encodeURIComponent(fieldId)}`, input);
    return res.data?.data?.field as CategoryField;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save the field.'));
  }
}

export async function deleteCategoryField(categoryId: string, fieldId: string): Promise<void> {
  try {
    await apiClient.delete(`${base(categoryId)}/fields/${encodeURIComponent(fieldId)}`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not delete the field.'));
  }
}

export async function reorderCategoryFields(categoryId: string, ids: string[]): Promise<void> {
  try {
    await apiClient.put(`${base(categoryId)}/fields/order`, { ids });
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not reorder the fields.'));
  }
}

/** The category's variant option name and suggested values ("Model": A1, A2). */
export async function saveCategoryOption(
  categoryId: string,
  input: { optionLabel: string | null; optionValues: string[] }
): Promise<void> {
  try {
    await apiClient.put(base(categoryId), input);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Could not save the variant option.'));
  }
}
