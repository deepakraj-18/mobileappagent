import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { HubCard } from '../../hub/types';

export type DockCardListProps = {
  cards: HubCard[];
  staleSince?: string | null;
  offline?: boolean;
};

function formatStale(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Display-only dock cards (FD050 / BD051). */
export function DockCardList({
  cards,
  staleSince,
  offline,
}: DockCardListProps): React.JSX.Element {
  return (
    <View style={styles.wrap} testID="dock-card-list">
      {offline && staleSince ? (
        <Text style={styles.stale} testID="dock-cards-stale">
          Cards stale since {formatStale(staleSince)} / offline
        </Text>
      ) : null}
      {cards.length === 0 ? (
        <Text style={styles.empty} testID="dock-cards-empty">
          No cards
        </Text>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
        >
          {cards.map(card => (
            <View key={card.id} style={styles.card} testID={`dock-card-${card.id}`}>
              <Text style={styles.kind}>{card.kind}</Text>
              <Text style={styles.title}>{card.title}</Text>
              {card.subtitle ? (
                <Text style={styles.sub}>{card.subtitle}</Text>
              ) : null}
              {card.body ? <Text style={styles.body}>{card.body}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxHeight: 200, gap: 6 },
  stale: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  empty: { color: '#64748b', fontSize: 12, textAlign: 'center' },
  list: { maxHeight: 180 },
  listContent: { gap: 8, paddingBottom: 4 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  kind: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: { color: '#f8fafc', fontSize: 14, fontWeight: '700', marginTop: 2 },
  sub: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
  body: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
});
