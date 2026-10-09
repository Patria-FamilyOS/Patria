import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, type } from '../theme';

type PlaceholderScreenProps = {
  title: string;
  body: string;
  accessibilityLabel: string;
};

export function PlaceholderScreen({
  title,
  body,
  accessibilityLabel,
}: PlaceholderScreenProps) {
  return (
    <SafeAreaView style={styles.safe} accessibilityLabel={accessibilityLabel}>
      <View style={styles.inner}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...type.heading,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  body: {
    ...type.body,
    color: colors.text,
  },
});
