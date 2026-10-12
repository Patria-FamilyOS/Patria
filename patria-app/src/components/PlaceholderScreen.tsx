import { Body, Screen, Title } from './ui';

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
    <Screen accessibilityLabel={accessibilityLabel}>
      <Title>{title}</Title>
      <Body>{body}</Body>
    </Screen>
  );
}
