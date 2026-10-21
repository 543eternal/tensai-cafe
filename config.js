/*
  ============================================================
  ✏️ 天才カフェ　リンク（URL）の設定ファイル
  ============================================================
  ここに書いたURLが、サイト内のボタンに自動で反映されます。
  "" （ダブルクォーテーション）の中だけを書きかえてください。
  使わないものは "" （空）のままでOK。空のボタンは表示されません。
  ============================================================
*/
window.SITE_CONFIG = {
  // 公式LINEの友だち追加URL
  lineUrl: "https://lin.ee/XXXXXXX",

  // メルマガ登録ページのURL（なければ "" のまま）
  newsletterUrl: "",

  // Instagram / YouTubeチャンネル のURL
  instagramUrl: "https://www.instagram.com/XXXXXXX/",
  youtubeUrl: "",

  // ---------- イベント申込み（Googleフォーム） ----------
  // 共通の申込フォームURL。
  // ※「https://docs.google.com/forms/d/e/〜/viewform」の形のURLを入れてください
  //   （forms.gle の短いURLだと、下の「イベント名の自動入力」が効きません）
  formUrl: "https://docs.google.com/forms/d/e/XXXXXXX/viewform",

  // フォームの「参加するイベント」の質問ID（例："entry.123456789"）
  // 入れておくと、申込ボタンを押したときにイベント名が最初から入力された状態になります。
  // 調べ方は README の「申込フォームの準備」を見てください。
  formEventEntry: "",

  // ---------- 残席表示（上級・なくてもOK） ----------
  // Google Apps Script（gas/apply-manager.gs）を「ウェブアプリ」として公開したURL。
  // 入れると、イベントに「残りあと○席」が表示されます。
  seatsApiUrl: "",

  // サイトの公開URL（シェアボタン・告知ツールで使います。最後は / で終わる）
  siteUrl: "https://543eternal.github.io/tensai-cafe/",

  // るみさんの「できること（セッション）」サイトのURL
  sessionUrl: "https://543eternal.github.io/rumi-menu/"
};
