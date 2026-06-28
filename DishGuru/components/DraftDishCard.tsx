import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CachedLogo from './CachedLogo';
import { DishAssociationDraft } from '../lib/appData';
import { theme } from '../lib/theme';
import { useLocale } from '../lib/locale';

type DraftDishCardProps = {
  draft: DishAssociationDraft;
  onEdit: (draft: DishAssociationDraft) => void;
  onDelete: (draft: DishAssociationDraft) => void;
  onPreviewImage?: (draft: DishAssociationDraft) => void;
};

export default function DraftDishCard({
  draft,
  onEdit,
  onDelete,
  onPreviewImage,
}: DraftDishCardProps) {
  const { isRTL, t } = useLocale();
  const createdAt = draft.created_at
    ? new Date(draft.created_at).toLocaleDateString()
    : '';

  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <Pressable
          style={styles.imageWrap}
          onPress={() => onPreviewImage?.(draft)}
        >
          {draft.image_url || draft.image_path ? (
            <CachedLogo
              uri={draft.image_url ?? draft.image_path ?? ''}
              imagePath={draft.image_path ?? null}
              style={styles.image}
              preferNative
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={20} color={theme.colors.textMuted} />
            </View>
        )}
        {createdAt ? (
          <View style={[styles.datePill, !isRTL && styles.datePillLtr]}>
            <Text style={styles.datePillText}>{createdAt}</Text>
          </View>
        ) : null}
          <View style={[styles.imageTextOverlay, !isRTL && styles.imageTextOverlayLtr]}>
            <Text style={[styles.title, !isRTL && styles.titleLtr]}>
              {t('draftUntitledDish')}
            </Text>
          </View>
        </Pressable>

        <View style={styles.body}>
          <View style={[styles.actionsRow, !isRTL && styles.actionsRowLtr]}>
            <Pressable style={styles.primaryAction} onPress={() => onEdit(draft)}>
              <Text style={styles.primaryActionText}>{t('draftEditAction')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={() => onDelete(draft)}>
              <Text style={styles.secondaryActionText}>{t('commonDelete')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(198, 164, 132, 0.52)',
    backgroundColor: 'rgba(232, 221, 210, 0.72)',
  },
  cardContent: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.97)',
  },
  imageWrap: {
    position: 'relative',
    height: 260,
    backgroundColor: theme.colors.cardAlt,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardAlt,
  },
  datePill: {
    position: 'absolute',
    top: 10,
    minHeight: 24,
    left: 12,
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePillLtr: {
    left: 'auto',
    right: 12,
  },
  datePillText: {
    color: theme.colors.accent,
    fontSize: 10,
    fontFamily: theme.typography.bold,
    fontWeight: '700',
  },
  imageTextOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    maxWidth: '62%',
    alignItems: 'flex-end',
  },
  imageTextOverlayLtr: {
    right: 'auto',
    left: 12,
    alignItems: 'flex-start',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 0,
  },
  title: {
    fontSize: 18,
    lineHeight: 26,
    fontFamily: theme.typography.bold,
    color: theme.colors.white,
    textAlign: 'right',
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  titleLtr: {
    textAlign: 'left',
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 0,
  },
  actionsRowLtr: {
    flexDirection: 'row',
  },
  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  primaryActionText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryAction: {
    minWidth: 110,
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(199, 93, 44, 0.24)',
    backgroundColor: theme.colors.card,
    paddingHorizontal: 16,
  },
  secondaryActionText: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
});
