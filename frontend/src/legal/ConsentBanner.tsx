import { analyticsConfigured, openLegal, setConsent, useConsent } from './legal'

export function ConsentBanner() {
  const consent = useConsent()
  if (consent !== null || !analyticsConfigured()) return null
  return (
    <div className="consent-banner" role="region" aria-label="Đồng ý cookie">
      <p>
        Hang MU muốn dùng cookie Google Analytics để đếm lượt truy cập (không quảng cáo).{' '}
        <button type="button" className="consent-link" onClick={openLegal}>
          Chi tiết
        </button>
      </p>
      <div className="consent-actions">
        <button type="button" className="consent-no" onClick={() => setConsent('no')}>
          Từ chối
        </button>
        <button type="button" className="consent-yes" onClick={() => setConsent('yes')}>
          Đồng ý
        </button>
      </div>
    </div>
  )
}
