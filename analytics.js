(function () {
  // Set your GA4 Measurement ID before deployment.
  var GA_MEASUREMENT_ID = 'G-1TZEV5VHWG';

  // 他のスクリプトから呼ぶ計測関数（GA未設定時は何もしない）
  window.smdTrack = function () {};

  if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_ID === 'G-XXXXXXXXXX') {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);

  var gaScript = document.createElement('script');
  gaScript.async = true;
  gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
  document.head.appendChild(gaScript);

  // ── イベント送信（個人情報は送らないこと）
  window.smdTrack = function (eventName, params) {
    try {
      window.gtag('event', eventName, params || {});
    } catch (error) {
      // 計測の失敗で画面の動作を止めない
    }
  };

  // ── 購入ボタン（メルカリ／Amazon）のクリック
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return;
    }

    var button = target.closest('a.market-button');
    if (!button) {
      return;
    }

    var platform = 'other';
    if (button.classList.contains('market-button--mercari')) {
      platform = 'mercari';
    } else if (button.classList.contains('market-button--amazon')) {
      platform = 'amazon';
    }

    window.smdTrack('purchase_click', {
      platform: platform,
      page_path: window.location.pathname,
      transport_type: 'beacon'
    });
  });
})();
