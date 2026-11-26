import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { campaigns } from '../../api'

/**
 * Whether the table plays its house rules (Nickramone fork).
 *
 * Everyone at the table sees it, so a player knows why their sheet reads the
 * campaign's version of a feat; the GM switches it here. Sheets follow at
 * once: a field with `from_campaign: house_rules` reads this switch.
 */
export default function CampaignHouseRules({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<{ on: boolean; editable: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    campaigns
      .houseRules(campaignId)
      .then((result) => {
        if (live) setState(result)
      })
      .catch(() => {
        if (live) setState(null)
      })
    return () => {
      live = false
    }
  }, [campaignId])

  if (!state) return null

  const label = t('campaignDetail.overview.houseRules')
  const value = state.on
    ? t('campaignDetail.overview.houseRulesOn')
    : t('campaignDetail.overview.houseRulesOff')

  if (!state.editable) {
    return (
      <span>
        {label}: <span style={{ color: 'var(--text-dim)' }}>{value}</span>
      </span>
    )
  }

  const toggle = async () => {
    setSaving(true)
    try {
      setState(await campaigns.setHouseRules(campaignId, !state.on))
    } finally {
      setSaving(false)
    }
  }

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      {label}:
      <input type="checkbox" checked={state.on} disabled={saving} onChange={toggle} />
      <span style={{ color: 'var(--text-dim)' }}>{value}</span>
    </label>
  )
}
