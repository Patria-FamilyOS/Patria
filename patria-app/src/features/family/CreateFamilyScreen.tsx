import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { Body, Button, ErrorState, Field, Muted, Screen, Title } from '../../components/ui';
import { copy } from '../../lib/copy';
import { writeCurrentFamilyId } from '../../lib/currentFamily';
import { supabase } from '../../lib/supabase';
import { colors, spacing, type } from '../../theme';

const RELATIONSHIPS = ['mum', 'dad', 'grandparent', 'guardian'] as const;

const schema = z.object({
  name: z.string().trim().min(1),
  relationship: z.enum(RELATIONSHIPS),
});

type FormValues = z.infer<typeof schema>;

export function CreateFamilyScreen() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', relationship: 'mum' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { data, error } = await supabase.rpc('create_family_space', {
      p_name: values.name,
      p_relationship_label: copy.relationships[values.relationship],
    });
    if (error || !data) {
      setFormError(error?.message ?? copy.common.error);
      return;
    }
    await writeCurrentFamilyId(String(data));
    router.replace('/(signed-in)/ready');
  });

  return (
    <Screen accessibilityLabel={copy.createFamily.title}>
      <Title>{copy.createFamily.title}</Title>
      <Body>{copy.createFamily.subtitle}</Body>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Field
            label={copy.createFamily.spaceNameLabel}
            placeholder={copy.createFamily.spaceNamePlaceholder}
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />
      <Muted>{copy.createFamily.relationshipLabel}</Muted>
      <Controller
        control={control}
        name="relationship"
        render={({ field }) => (
          <View style={styles.chips}>
            {RELATIONSHIPS.map((key) => {
              const selected = field.value === key;
              const label = copy.relationships[key];
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                  onPress={() => field.onChange(key)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      />
      {formError ? <ErrorState message={formError} /> : null}
      <Button
        label={copy.createFamily.submit}
        onPress={onSubmit}
        disabled={formState.isSubmitting}
      />
      <Muted>{copy.createFamily.privacy}</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
    borderRadius: 24,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipLabel: {
    ...type.caption,
    color: colors.text,
  },
  chipLabelSelected: {
    color: colors.onPrimary,
  },
});
