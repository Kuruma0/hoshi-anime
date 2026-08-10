import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useIsOnline } from '@/data/offline';
import { Button } from '@/design/Button';
import { Text } from '@/design/Text';
import { color, gutter, space } from '@/design/tokens';
import { messageFor } from '@/lib/errors';

/**
 * The three states every network-dependent surface must handle (§24).
 *
 * They share a layout so a screen never jumps between states, and the error
 * copy comes from lib/errors rather than being written at each call site, the
 * message a user sees depends on what actually failed.
 */

/**
 * Offline is shown here rather than as a spinner because that is the truth:
 * with no connection the query is paused, not loading, and an indicator that
 * can never resolve is the one state worse than an error.
 */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  const online = useIsOnline();

  if (!online) {
    return (
      <EmptyState
        title="You are offline."
        detail="Saved chapters are in your library under Offline. This will load when the connection returns."
      />
    );
  }

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={color.accentBright} />
    </View>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.container}>
      <Text variant="subtitle" style={styles.heading}>
        {title}
      </Text>
      {detail ? (
        <Text variant="body" tone="muted" style={styles.detail}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, detail } = messageFor(error);

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text variant="subtitle" style={styles.heading}>
        {title}
      </Text>
      <Text variant="body" tone="muted" style={styles.detail}>
        {detail}
      </Text>
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

/**
 * Fixed-height placeholder used inside horizontal rails, so a failing rail does
 * not collapse the row and shift everything below it.
 */
export function InlineState({
  state,
  height,
  onRetry,
  error,
  emptyLabel = 'Nothing here yet.',
}: {
  state: 'loading' | 'error' | 'empty';
  height: number;
  onRetry?: () => void;
  error?: unknown;
  emptyLabel?: string;
}) {
  return (
    <View style={[styles.inline, { height }]}>
      {state === 'loading' ? <ActivityIndicator color={color.accentBright} /> : null}
      {state === 'empty' ? (
        <Text variant="meta" tone="faint">
          {emptyLabel}
        </Text>
      ) : null}
      {state === 'error' ? (
        <>
          <Text variant="meta" tone="muted">
            {messageFor(error).title}
          </Text>
          {onRetry ? (
            <Button label="Retry" onPress={onRetry} variant="ghost" style={styles.inlineAction} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: gutter,
    paddingVertical: space.xxxl,
  },
  heading: { textAlign: 'center' },
  detail: { textAlign: 'center', marginTop: space.sm, maxWidth: 320 },
  action: { marginTop: space.xl },
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: gutter,
  },
  inlineAction: { marginTop: space.xs },
});
