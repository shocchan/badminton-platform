# 学習者向け「冒険ガイド」の組版（ja主体版・zh主体版の2ファイル）。
# 実行: python3 scripts/ai-course/build-student-guide.py
# 入力: docs/ai-course/guide/img/*-ja.png / *-zh.png（render-guide-shots.tsx + playwright で生成）
#       public/images/ai-course/companions/*.webp（相棒の正式イラスト）
# 出力: docs/ai-course/guide/student-guide-ja.html / student-guide-zh.html
#       （画像埋め込みの自己完結1ファイル。WeChat転送・印刷可。ライト/ダーク両対応）
#
# デザイン（2026-08-15 リッチ化・CEO指示）: 深いネイビー×ゴールドの上質トーン。
# ヒーローと目的地パネルは光彩＋ドット地図模様、カードは多層シャドウ、本文はコントラスト強め。
#
# 内容の鉄則（2026-08-15 汎用化・CEO指示）: 特定の生徒の目標（N2・帰化面接など）を
# 全員の未来として書かない。目的地は「JLPT合格／会話力／帰化面接」の3枚カードで
# 「あなたが選ぶ」と示す。ログインは ID＋パスワード方式（現行）で説明する。
import base64
import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(BASE, 'docs/ai-course/guide/img')
BUDDY = os.path.join(BASE, 'public/images/ai-course/companions')


def img_tag(name: str, alt: str, width: int = 310) -> str:
    with open(os.path.join(IMG, name), 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    return (f'<figure class="phone"><img src="data:image/png;base64,{b64}" alt="{alt}" '
            f'loading="lazy" style="width:min({width}px,100%)" /></figure>')


def buddy_img(name: str, alt: str) -> str:
    with open(os.path.join(BUDDY, f'{name}.webp'), 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    return f'<img src="data:image/webp;base64,{b64}" alt="{alt}" />'


def build(lang: str) -> str:
    """lang: 'ja' or 'zh'（主言語）。もう一方は小さく併記する。"""
    other = 'zh' if lang == 'ja' else 'ja'

    def t(ja: str, zh: str) -> str:
        """主言語を大きく、副言語を小さく"""
        p1, p2 = (ja, zh) if lang == 'ja' else (zh, ja)
        return f'<p class="p1">{p1}</p><p class="p2">{p2}</p>'

    def one(ja: str, zh: str) -> str:
        """主言語のみ（見出し・ラベル用）"""
        return ja if lang == 'ja' else zh

    def shot(base: str, alt: str, width: int = 310) -> str:
        return img_tag(f'{base}-{lang}.png', alt, width)

    eyebrow = {
        'goal': one('目的地', '目的地'),
        'step': one('はじめの10分', '最初的10分钟'),
        'daily': one('毎日のこと', '每天要做的'),
        'why': one('しくみ', '原理'),
        'events': one('節目', '里程碑'),
        'qa': one('よくある不安', '常见的不安'),
        'start': one('はじめる', '开始'),
    }

    buddies = (buddy_img('natsu', 'ナツ') + buddy_img('haru', 'ハル') + buddy_img('aki', 'アキ'))

    # app=1: 未ログインでも販売LPではなくログイン画面を直接出す（契約済みの生徒に営業ページを見せない）
    # WeChat内ブラウザは *.pages.dev をブロックするため、必ず study.kawabado.com を案内する（2026-08-15）
    url_main = f'https://study.kawabado.com/{lang}/ai-course?app=1&v2=1'
    url_sub = f'https://study.kawabado.com/{other}/ai-course?app=1&v2=1'

    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{one('「日本語の相棒」冒険ガイド', '「你的日语搭档」冒险指南')}</title>
<style>
{CSS_TOKENS}
  * {{ box-sizing:border-box; margin:0; }}
  body {{ font-family:system-ui,-apple-system,"PingFang SC","Hiragino Sans",sans-serif;
    color:var(--ink); background:var(--bg); line-height:1.8; font-size:16px;
    -webkit-font-smoothing:antialiased; }}
  main {{ max-width:660px; margin:0 auto; padding:22px 16px 72px; }}

  /* ── ネイビーパネル共通（ヒーロー・目的地）: 光彩＋ドット地図模様 ── */
  .navy {{ position:relative; overflow:hidden; color:#fff; border-radius:24px;
    background:
      radial-gradient(90% 70% at 88% -12%, rgb(96 165 250 / .30), transparent 62%),
      radial-gradient(64% 52% at -8% 112%, rgb(217 154 43 / .24), transparent 60%),
      linear-gradient(155deg, #1c3b7c 0%, #142c5e 46%, #0b1b3c 100%);
    box-shadow: 0 22px 55px rgb(11 27 60 / .35), inset 0 1px 0 rgb(255 255 255 / .14); }}
  .navy::before {{ content:''; position:absolute; inset:0; pointer-events:none;
    background-image:radial-gradient(rgb(255 255 255 / .13) 1px, transparent 1.4px);
    background-size:22px 22px; }}
  .navy > * {{ position:relative; }}

  .hero {{ padding:30px 24px 26px; }}
  .brand {{ font-size:.8rem; font-weight:800; letter-spacing:.12em; color:#cfe0ff; }}
  .hero h1 {{ font-size:1.72rem; line-height:1.34; font-weight:800; margin-top:8px; text-wrap:balance; }}
  .rule {{ width:46px; height:4px; border-radius:99px; margin-top:12px;
    background:linear-gradient(90deg, var(--gold), #f6cd6b); box-shadow:0 2px 8px rgb(217 154 43 / .5); }}
  .hero .p1 {{ color:#dbe7ff; font-size:.95rem; margin-top:12px; }}
  .hero .p2 {{ color:#9db8ea; font-size:.82rem; margin-top:4px; }}

  .journey {{ display:flex; align-items:flex-start; margin-top:24px; gap:4px; }}
  .journey .stop {{ flex:none; text-align:center; width:92px; }}
  .journey .dot {{ width:38px; height:38px; margin:0 auto; border-radius:999px;
    background:rgb(255 255 255 / .13); border:2px solid rgb(255 255 255 / .6);
    box-shadow:inset 0 1px 0 rgb(255 255 255 / .35), 0 4px 12px rgb(0 0 0 / .25);
    display:flex; align-items:center; justify-content:center; font-size:1rem; font-weight:800; }}
  .journey .stop.flag .dot {{ background:linear-gradient(150deg,#fbd06b,#e9a52f); border-color:#ffe9ad;
    color:#5d3c05; box-shadow:0 0 0 4px rgb(233 165 47 / .25), 0 6px 16px rgb(233 165 47 / .45); }}
  .journey .stop b {{ display:block; font-size:.8rem; margin-top:8px; }}
  .journey .stop span {{ display:block; font-size:.68rem; color:#b9cdf5; line-height:1.45; }}
  .journey .leg {{ flex:1; border-top:2px dashed rgb(255 255 255 / .5); margin-top:19px; }}

  .buddies {{ display:flex; align-items:center; gap:8px; margin-top:22px;
    border-top:1px solid rgb(255 255 255 / .16); padding-top:16px; }}
  .buddies img {{ width:46px; height:46px; border-radius:999px;
    border:2px solid rgb(255 255 255 / .75); box-shadow:0 5px 14px rgb(0 0 0 / .35); }}
  .buddies img + img {{ margin-left:-10px; }}
  .buddies span {{ font-size:.78rem; color:#cfe0ff; margin-left:8px; line-height:1.5; }}

  /* ── セクション共通 ── */
  section {{ background:var(--card); border:1px solid var(--line); border-radius:20px;
    padding:24px 22px; margin-top:18px; position:relative;
    box-shadow:0 1px 2px rgb(12 27 60 / .05), 0 14px 36px rgb(12 27 60 / .09); }}
  .eyebrow {{ font-size:.7rem; font-weight:800; letter-spacing:.16em; color:var(--eyebrow);
    text-transform:uppercase; display:flex; align-items:center; gap:8px; }}
  .eyebrow::before {{ content:''; width:18px; height:3px; border-radius:2px;
    background:linear-gradient(90deg, var(--gold), #f0c464); }}
  h2 {{ font-size:1.2rem; font-weight:800; margin-top:6px; display:flex; align-items:center; gap:10px;
    text-wrap:balance; letter-spacing:.01em; }}
  h2 .n {{ flex:none; display:inline-flex; align-items:center; justify-content:center;
    width:31px; height:31px; border-radius:999px; color:#fff; font-size:.95rem;
    background:linear-gradient(140deg,#3f79f0,#1d4ed8); box-shadow:0 6px 14px rgb(37 99 235 / .38); }}
  .p1 {{ font-size:.97rem; margin-top:10px; }}
  .p2 {{ font-size:.85rem; color:var(--sub); margin-top:3px; }}

  /* STEP群は点線ルートで縦に接続（地図のメタファー） */
  .route {{ position:relative; }}
  .route::before {{ content:''; position:absolute; left:37px; top:24px; bottom:24px;
    border-left:3px dashed var(--rail); }}

  /* ── 画像（スマホフレーム） ── */
  .phone {{ margin:16px auto 2px; text-align:center; }}
  .phone img {{ border:1px solid var(--shot-line); border-radius:18px; background:#fff;
    box-shadow:0 2px 6px rgb(12 27 60 / .07), 0 18px 44px rgb(12 27 60 / .16); }}
  .cap {{ text-align:center; font-size:.76rem; color:var(--cap); margin-top:9px; }}

  /* ── 目的地パネル: 3枚のゴールカード（あなたが選ぶ） ── */
  .future {{ padding:24px 22px; margin-top:18px; }}
  .future .eyebrow {{ color:#a9c6ff; }}
  .future h2 {{ color:#fff; }}
  .future .p1 {{ color:#dbe7ff; }}
  .future .p2 {{ color:#9db8ea; }}
  .goals {{ display:grid; gap:12px; margin-top:16px; }}
  .goal {{ background:rgb(255 255 255 / .09); border:1px solid rgb(255 255 255 / .22);
    border-radius:16px; padding:14px 16px 13px;
    box-shadow:inset 0 1px 0 rgb(255 255 255 / .12); }}
  .goal .gi {{ float:right; font-size:1.35rem; margin-left:10px; filter:drop-shadow(0 3px 6px rgb(0 0 0/.3)); }}
  .goal b {{ display:block; font-size:.97rem; color:#fff; }}
  .goal .gd {{ font-size:.88rem; color:#dbe7ff; margin-top:4px; }}
  .goal .gs {{ display:block; font-size:.78rem; color:#9db8ea; margin-top:3px; }}
  .tag {{ display:inline-block; font-size:.66rem; font-weight:800; letter-spacing:.05em;
    border-radius:999px; padding:1px 9px; margin-left:6px; vertical-align:2px;
    background:linear-gradient(140deg,#fbd06b,#e9a52f); color:#5d3c05; }}
  .honest {{ font-size:.76rem; color:#9db8ea; margin-top:16px;
    border-top:1px solid rgb(255 255 255 / .18); padding-top:12px; }}

  /* ── ループ図・チップ ── */
  .flow {{ display:flex; gap:6px; align-items:stretch; margin-top:14px; }}
  .flow > div {{ flex:1; border-radius:12px; padding:10px 6px; text-align:center;
    font-size:.8rem; font-weight:800; color:var(--chip-ink);
    background:linear-gradient(180deg, var(--chip-bg1), var(--chip-bg2));
    border:1px solid var(--chip-line); box-shadow:0 2px 6px rgb(12 27 60 / .06); }}
  .flow > div span {{ display:block; font-size:.68rem; font-weight:500; margin-top:2px; opacity:.8; }}
  .flow > .arrow {{ flex:none; align-self:center; background:none; border:none; color:var(--cap);
    padding:0; font-weight:400; box-shadow:none; }}

  .note {{ border-radius:14px; padding:12px 14px 11px; font-size:.86rem; color:var(--note-ink);
    margin-top:14px; background:linear-gradient(180deg, var(--note-bg1), var(--note-bg2));
    border:1px solid var(--note-line); box-shadow:0 2px 8px rgb(140 96 10 / .08); }}
  .note b {{ display:block; font-size:.7rem; letter-spacing:.14em; margin-bottom:3px; }}

  .why .mech {{ margin-top:18px; padding-left:40px; position:relative; }}
  .why {{ counter-reset:why; }}
  .why .mech::before {{ counter-increment:why; content:counter(why);
    position:absolute; left:0; top:2px; width:27px; height:27px; border-radius:999px;
    background:linear-gradient(180deg, var(--chip-bg1), var(--chip-bg2));
    border:1px solid var(--chip-line); color:var(--chip-ink);
    display:flex; align-items:center; justify-content:center; font-size:.8rem; font-weight:800;
    box-shadow:0 2px 6px rgb(12 27 60 / .08); }}
  .why .mech .p1 {{ margin-top:0; }}

  .badge {{ display:inline-block; font-size:.68rem; font-weight:800; letter-spacing:.04em;
    border-radius:999px; padding:2px 10px; margin-right:7px; vertical-align:1px; border:1px solid; }}
  .badge.all {{ background:var(--bd-all-bg); color:var(--bd-all-ink); border-color:var(--bd-all-line); }}
  .badge.some {{ background:var(--bd-some-bg); color:var(--bd-some-ink); border-color:var(--bd-some-line); }}

  .buddyline {{ display:flex; align-items:center; gap:2px; margin-top:14px; }}
  .buddyline img {{ width:38px; height:38px; border-radius:999px; border:2px solid var(--card);
    box-shadow:0 3px 9px rgb(12 27 60 / .18); }}
  .buddyline img + img {{ margin-left:-9px; }}
  .buddyline p {{ font-size:.85rem; color:var(--sub); margin-left:10px; line-height:1.55; }}

  .qa dt {{ font-weight:800; font-size:.93rem; margin-top:17px; padding-left:31px; position:relative; }}
  .qa dt::before {{ content:"Q"; position:absolute; left:0; top:1px; width:23px; height:23px;
    border-radius:8px; color:#fff; background:linear-gradient(140deg,#3f79f0,#1d4ed8);
    display:flex; align-items:center; justify-content:center; font-size:.72rem;
    box-shadow:0 3px 8px rgb(37 99 235 / .3); }}
  .qa dd {{ margin:4px 0 0 31px; }}

  .url {{ background:var(--url-bg); border-radius:12px; padding:12px 14px;
    font-family:ui-monospace,monospace; font-size:.83rem; font-weight:600; color:var(--url-ink);
    word-break:break-all; margin-top:10px; border:1px solid var(--url-line); }}
  footer {{ text-align:center; font-size:.75rem; color:var(--cap); margin-top:32px; letter-spacing:.06em; }}
</style></head><body><main>

<div class="hero navy">
  <p class="brand">{one('日本語の相棒 ｜ 你的日语搭档', '你的日语搭档 ｜ 日本語の相棒')}</p>
  <h1>{one('冒険ガイド — 何から始めて、どこへ辿り着くのか', '冒险指南 — 从哪里开始，到达哪里')}</h1>
  <div class="rule"></div>
  {t('このガイド1枚で、最初の10分・毎日の15分・目標の日までの旅の全体が分かります。',
     '这一页指南，让你看清最初的10分钟、每天的15分钟、直到目标之日的整个旅程。')}
  <div class="journey">
    <div class="stop"><div class="dot">1</div><b>{one('今日', '今天')}</b><span>{one('ルート作り 10分', '生成路线 10分钟')}</span></div>
    <div class="leg"></div>
    <div class="stop"><div class="dot">∞</div><b>{one('毎日', '每天')}</b><span>{one('ボタン1つ 約15分', '一个按钮 约15分钟')}</span></div>
    <div class="leg"></div>
    <div class="stop flag"><div class="dot">⚑</div><b>{one('目標の日', '目标之日')}</b><span>{one('あなたの目的地へ', '抵达你的目的地')}</span></div>
  </div>
  <div class="buddies">{buddies}<span>{one('旅の相棒（ナツ・ハル・アキ）から1体えらんで、いっしょに進みます',
    '从旅行伙伴（ナツ・ハル・アキ）中选一位，一起前进')}</span></div>
</div>

<section class="future navy">
  <p class="eyebrow">{eyebrow['goal']}</p>
  <h2>{one('目的地は、あなたが選ぶ', '目的地，由你来选')}</h2>
  {t('このコースの目的地はひとつではありません。最初の10分で目的を選ぶと、そこへ向かうあなた専用のルートができます。',
     '这门课程的目的地不止一个。最初的10分钟选好目标后，就会生成通往那里的你的专属路线。')}
  <div class="goals">
    <div class="goal"><span class="gi">🎯</span>
      <b>{one('JLPT合格をめざす人（N3・N2）', '以JLPT合格为目标的人（N3・N2）')}</b>
      <span class="gd">{one('目標の日、本番と同じ時間の感覚で問題を解けている。文法・語彙・読解・聴解を試験と同じ4技能で鍛えるから。',
        '到了目标之日，能以接近真实考试的时间感觉解题。因为语法・词汇・阅读・听力都按考试的4项技能来锻炼。')}</span>
      <span class="gs">{one('到目标之日，能以接近真实考试的时间感觉解题', '目標の日、本番と同じ時間の感覚で解ける')}</span></div>
    <div class="goal"><span class="gi">💬</span>
      <b>{one('会話力を伸ばしたい人', '想提升会话能力的人')}</b>
      <span class="gd">{one('毎日AIと日本語で話してきたから、話し出すことが怖くなくなっている。生活の場面で「自分の言葉」が出る。',
        '因为每天都和AI用日语对话，开口不再可怕。在生活场景里能说出「自己的话」。')}</span>
      <span class="gs">{one('因为每天和AI对话，开口说日语不再可怕', '毎日AIと話すから、話し出すことが怖くない')}</span></div>
    <div class="goal"><span class="gi">🏛️</span>
      <b>{one('帰化面接に向かう人', '准备入籍面试的人')}<span class="tag">{one('対象の人', '对象学员')}</span></b>
      <span class="gd">{one('面接で聞かれることに、自分の言葉の日本語で答えられるようになっている。専用の表現特訓は先生から発行されます。',
        '面对面试的提问，能用自己的话作答。专用的表达特训由老师发放。')}</span>
      <span class="gs">{one('面对入籍面试的提问，能用自己的话作答', '帰化面接の質問に、自分の言葉で答えられる')}</span></div>
  </div>
  <p class="honest">{one('※ 合格を保証するものではありません。目的はあとから「目的・レベルを変える」でいつでも変えられます（記録は消えません）。',
    '※ 不构成合格保证。目标之后可以随时在「更改目标・级别」中调整（记录不会消失）。')}</p>
</section>

<div class="route">
<section>
  <p class="eyebrow">{eyebrow['step']}</p>
  <h2><span class="n">1</span>{one('ログインIDとパスワードでログイン', '用登录ID和密码登录')}</h2>
  {t('先生から届いた<b>ログインID</b>と<b>パスワード</b>を入れるだけ。ログインのあと、「設定」からパスワードを自分のものに変えられます。',
     '输入老师发给你的<b>登录ID</b>和<b>密码</b>即可。登录后可以在「设置」里把密码改成自己的。')}
  {shot('step0-login', 'ログイン画面')}
  <p class="cap">{one('2回目からは自動ログイン', '第二次起自动登录')}</p>
</section>

<section>
  <p class="eyebrow">{eyebrow['step']}</p>
  <h2><span class="n">2</span>{one('名前を入れる（10秒）', '输入名字（10秒）')}</h2>
  {t('聞かれるのは<b>名前だけ</b>。長いアンケートはありません。', '只问<b>名字</b>，没有冗长的问卷。')}
  {shot('step1-name', '名前入力画面')}
</section>

<section>
  <p class="eyebrow">{eyebrow['step']}</p>
  <h2><span class="n">3</span>{one('目的を選んで、現在地を測る（約10分）', '选择目标，测出当前位置（约10分钟）')}</h2>
  {t('冒険の目的（JLPT合格・会話・両方）を選び、そのあと12問の選択問題で「今のあなたの現在地」を測ります。書く問題はありません。',
     '选择冒险目的（JLPT合格・会话・两者都要），然后通过12道选择题测出「你现在的位置」。不需要打字输入。')}
  {shot('step2-goal', '目的選択画面')}
  <div class="note"><b>{one('あんしん', '放心')}</b>{one(
    'わからない問題は「わからない」でOK。正確なルートを作るための測定なので、できなくてもまったく問題ありません。',
    '不会的题选「不知道」就好。这只是为了生成准确路线的测量，不会做完全没关系。')}</div>
</section>

<section>
  <p class="eyebrow">{eyebrow['step']}</p>
  <h2><span class="n">4</span>{one('あなた専用の攻略ルートが完成', '生成你的专属攻略路线')}</h2>
  {t('診断が終わると<b>成長マップ</b>ができます。現在地・次の目的地・最終目的地が地図になり、進むほど霧が晴れていきます。目的地までの「残り」も数字で見えます。',
     '诊断结束后生成<b>成长地图</b>。当前位置、下一个目的地、最终目的地都画在地图上，越前进迷雾越散。到目的地「还剩多少」也会用数字显示。')}
  {shot('map-top', '成長マップ')}
  <p class="cap">{one('定着率は実際に測った数字だけを表示します（盛りません）', '巩固度只显示实测数字（不夸大）')}</p>
</section>
</div>

<section>
  <p class="eyebrow">{eyebrow['daily']}</p>
  <h2>{one('毎日は、この青いボタンを押すだけ（約15分）', '每天只需按这个蓝色按钮（约15分钟）')}</h2>
  {t('毎日ホームを開くと「今日の一歩」が用意されています。<b>押すボタンは1つ</b>。今日やる3つ（復習→新しい文法→問題バトル など）はAIが決めてあります。',
     '每天打开首页，「今天的一步」已经准备好。<b>只需按一个按钮</b>。今天的3项（复习→新语法→题目战斗等）由AI安排好。')}
  {shot('today-cta', '今日の一歩', 330)}
  {t('中身の例＝問題バトル。答えるとすぐに正解と「なぜ」の解説が出ます。',
     '内容示例＝题目战斗。作答后立即显示正确答案和「为什么」的讲解。')}
  {shot('daily-battle', '問題バトル')}
  <div class="buddyline">{buddies}<p>{one('選んだ相棒が、毎日の声掛け・バトルの励まし・週のまとめでいっしょに進みます。',
    '你选的旅行伙伴会在每天的问候、战斗中的鼓励、每周小结里陪你一起前进。')}</p></div>
  <div class="note"><b>{one('あんしん', '放心')}</b>{one(
    '途中でやめても、終わったところまで自動保存。次に開くと続きから。毎日できなくても大丈夫（霧が少し戻るだけ。責められません）。',
    '中途退出也会自动保存，下次从接续处继续。偶尔没做也没关系（只是迷雾稍微回来一点，不会被责备）。')}</div>
</section>

<section class="why">
  <p class="eyebrow">{eyebrow['why']}</p>
  <h2>{one('なぜ、この15分で伸びるのか', '为什么这15分钟会有效')}</h2>
  {t('「毎日押しているだけで、本当に力がついているの？」——大事な疑問なので、仕組みをそのまま説明します。',
     '「每天按一下按钮，真的在进步吗？」——这是很重要的疑问，所以我们把机制原样讲给你听。')}

  <div class="mech">{t('<b>今日の3つは、あなたの記録から選ばれています。</b>AIは「忘れかけていることば」「次に必要な文法」「まちがえたばかりの問題」を毎朝選び直します。だれにでも同じ教材を配っているのではありません。',
    '<b>今天的3项，是从你的记录里选出来的。</b>AI每天重新挑选「快要忘记的词」「下一步需要的语法」「刚答错的题」。不是给所有人发同样的教材。')}</div>
  <div class="flow">
    <div>{one('学ぶ', '学')}<span>{one('新しい文法・ことば', '新语法・生词')}</span></div>
    <div class="arrow">→</div>
    <div>{one('使う', '用')}<span>{one('バトルで確認', '战斗中确认')}</span></div>
    <div class="arrow">→</div>
    <div>{one('まちがえる', '错')}<span>{one('自動で回収', '自动回收')}</span></div>
    <div class="arrow">→</div>
    <div>{one('復習', '复习')}<span>{one('忘れた頃にもう一度', '快忘时再来一次')}</span></div>
  </div>
  <p class="cap">{one('まちがえた問題は自動で復習と明日の冒険に入り、忘れかけたタイミングでもう一度出ます',
    '答错的题自动进入复习和明天的冒险，在快忘记的时候再次出现')}</p>

  <div class="mech">{t('<b>まぐれでは先に進めません。</b>マップが「攻略済み」になる条件は、<b>別の日に3回、80%以上</b>。初めて見る問題を含めて、問い方も変えて出します。7日後にもう一度確認もします。だから、晴れた霧は「本当に身についた証拠」です。',
    '<b>靠运气无法前进。</b>地图变成「已攻略」的条件是：<b>不同的3天、都答对80%以上</b>，而且包含第一次见的题、换着问法出。7天后还会再确认一次。所以散去的迷雾，就是「真正学会的证据」。')}</div>

  <div class="mech">{t('<b>試験と同じ4技能で記録しています。</b>文法・語彙・読解・聴解（実際の音声）を、JLPTの試験科目と同じ区分で測ります。文法だけ満点でも「総合準備度」は出ません。弱い技能は、AIが今日の冒険に混ぜて直します。',
    '<b>按考试的4项技能记录。</b>语法・词汇・阅读・听力（真实音频）按JLPT考试科目同样的区分来测。只有语法满分不会显示「综合准备度」。哪项弱，AI就会把它混进今天的冒险来纠正。')}</div>

  <div class="mech">{t('<b>この毎日が、目標の日につながります。</b>毎日の復習→覚えたことが目標の日まで残る。時間つきのバトルと模試→本番の時間感覚。毎日のAI会話と言い直し練習→面接や生活で「自分の言葉」が出る。',
    '<b>这样的每一天，通向目标之日。</b>每天的复习→学过的内容保持到目标当天。限时的战斗和模拟考→真实考试的时间感觉。每天的AI会话和改口练习→面试和生活中说得出「自己的话」。')}</div>
</section>

<section>
  <p class="eyebrow">{eyebrow['events']}</p>
  <h2>{one('節目のイベント（目的によって）', '里程碑（因目标而异）')}</h2>
  <p class="p1"><span class="badge all">{one('全員', '所有人')}</span><b>{one('ミニ模試', '迷你模拟考')}</b>: {one('時間つきで4技能を測り、準備度に反映されます。', '限时测4项技能，反映到准备度。')}</p>
  <p class="p2">{one('限时测4项技能，反映到准备度。', '時間つきで4技能を測り、準備度に反映されます。')}</p>
  <p class="p1"><span class="badge some">{one('N2で受験する人', '报考N2的人')}</span><b>{one('過去問の試験場', '真题考场')}</b>: {one('先生からWeChatで届く本物の過去問を、本番と同じ制限時間で解いて、アプリのマークシートに記入します。', '老师通过微信发来真题，按真实考试的限时作答，答案填在应用的答题卡上。')}</p>
  <p class="p2">{one('老师通过微信发来真题，按真实考试的限时作答，答案填在应用的答题卡上。', '先生からWeChatで届く本物の過去問を、本番と同じ制限時間で解いて、アプリのマークシートに記入します。')}</p>
  {shot('sheets-marking', '過去問のマークシート')}
  <p class="p1"><span class="badge some">{one('対象の人', '对象学员')}</span><b>{one('帰化面接の表現特訓', '入籍面试表达特训')}</b>: {one('面接で聞かれそうな30問を「自分の言葉」で言える状態にします。模擬面接そのものは先生の授業で行います。', '把面试可能被问的30个问题，练到能「用自己的话」说出来。模拟面试在老师的课上进行。')}</p>
  <p class="p2">{one('把面试可能被问的30个问题，练到能「用自己的话」说出来。', '面接で聞かれそうな30問を「自分の言葉」で言える状態にします。')}</p>
  {shot('interview-home', '帰化面接の表現特訓')}
  {t('そして<b>先生（安田翔）のレッスン</b>。システムがあなたの記録を先生に渡すので、レッスンでは難しいところだけを人が集中して直します。',
     '还有<b>老师（安田翔）的课</b>。系统会把你的学习记录交给老师，课上由真人集中解决难点。')}
</section>

<section class="qa">
  <p class="eyebrow">{eyebrow['qa']}</p>
  <h2>{one('よくある不安', '常见的不安')}</h2>
  <dl>
    <dt>{one('忙しくて毎日できなかったら？', '太忙没法每天学怎么办？')}</dt>
    <dd>{t('大丈夫。開いた日から続きが始まります。記録が消えることはありません。',
           '没关系。哪天打开就从哪天继续，记录不会消失。')}</dd>
    <dt>{one('診断でぜんぜん解けなかったら恥ずかしい…', '诊断时全都不会，好丢脸…')}</dt>
    <dd>{t('診断はテストではなく「地図を作る測量」です。できないことが分かるほど、ルートが正確になります。',
           '诊断不是考试，而是「绘制地图的测量」。越是暴露不会的地方，路线越准确。')}</dd>
    <dt>{one('目的を選び間違えたら？', '目标选错了怎么办？')}</dt>
    <dd>{t('メニューの「目的・レベルを変える」でいつでもやり直せます。学習の記録は消えません。',
           '可以随时在菜单的「更改目标・级别」里重新选择。学习记录不会消失。')}</dd>
    <dt>{one('スマホでできますか？', '手机能用吗？')}</dt>
    <dd>{t('できます。iPhone・Androidのブラウザで動きます。会話練習はマイクを使います。',
           '可以。iPhone・Android的浏览器都能用。会话练习会用到麦克风。')}</dd>
    <dt>{one('困ったら？', '遇到问题怎么办？')}</dt>
    <dd>{t('WeChatで先生にいつでも聞いてください。アプリの「設定 → 困ったときは」からも報告できます。',
           '随时在微信上问老师。也可以在应用的「设置 → 遇到问题时」里报告。')}</dd>
  </dl>
</section>

<section>
  <p class="eyebrow">{eyebrow['start']}</p>
  <h2>{one('はじめる', '开始你的冒险')}</h2>
  {t('先生から届いたログインID・パスワードを手元に、このリンクを開いてください。',
     '准备好老师发来的登录ID和密码，打开这个链接。')}
  <div class="url">{url_main}</div>
  <p class="cap">{one(f'中国語表示 → {url_sub}', f'日语界面 → {url_sub}')}</p>
</section>

<footer>{one('日本語の相棒 / 你的日语搭档 — 冒険ガイド', '你的日语搭档 / 日本語の相棒 — 冒险指南')}</footer>
</main></body></html>"""


# CSSトークン（ライト/ダーク。@media と data-theme の両方で上書き）
CSS_TOKENS = """
  :root {
    --bg:#edf1f8; --card:#ffffff; --ink:#0c1b33; --sub:#43536e; --line:#d9e2ef;
    --blue:#2456c9; --gold:#d99a2b; --eyebrow:#1d4ed8; --cap:#69809d;
    --chip-bg1:#f4f8ff; --chip-bg2:#e7effc; --chip-line:#c3d7f5; --chip-ink:#1e40af;
    --note-bg1:#fffaf0; --note-bg2:#fdf2d9; --note-line:#ecd8a2; --note-ink:#7c5200;
    --url-bg:#f0f5fc; --url-line:#c9d8ef; --url-ink:#16345e;
    --shot-line:#c9d6e8; --rail:#a8c4ec;
    --bd-all-bg:#e7f6ee; --bd-all-ink:#0b7a44; --bd-all-line:#b7e2c9;
    --bd-some-bg:#fdf3dd; --bd-some-ink:#8a5b00; --bd-some-line:#eed9a4;
  }
  @media (prefers-color-scheme: dark) { :root {
    --bg:#0a111f; --card:#101a2d; --ink:#e6ecf6; --sub:#a3b2c9; --line:#1f2e48;
    --blue:#5b93ff; --gold:#e0aa46; --eyebrow:#8fb4ff; --cap:#7286a1;
    --chip-bg1:#16273f; --chip-bg2:#122036; --chip-line:#2b4a70; --chip-ink:#a5c8ff;
    --note-bg1:#251d09; --note-bg2:#1e1806; --note-line:#4a3c12; --note-ink:#f0cd6d;
    --url-bg:#0e1a2e; --url-line:#2b4262; --url-ink:#bcd3f2;
    --shot-line:#31435e; --rail:#2c4a75;
    --bd-all-bg:#0d281a; --bd-all-ink:#6fd8a2; --bd-all-line:#1c4e33;
    --bd-some-bg:#2a2208; --bd-some-ink:#e8c766; --bd-some-line:#4a3c12;
  } }
  :root[data-theme="light"] {
    --bg:#edf1f8; --card:#ffffff; --ink:#0c1b33; --sub:#43536e; --line:#d9e2ef;
    --blue:#2456c9; --gold:#d99a2b; --eyebrow:#1d4ed8; --cap:#69809d;
    --chip-bg1:#f4f8ff; --chip-bg2:#e7effc; --chip-line:#c3d7f5; --chip-ink:#1e40af;
    --note-bg1:#fffaf0; --note-bg2:#fdf2d9; --note-line:#ecd8a2; --note-ink:#7c5200;
    --url-bg:#f0f5fc; --url-line:#c9d8ef; --url-ink:#16345e;
    --shot-line:#c9d6e8; --rail:#a8c4ec;
    --bd-all-bg:#e7f6ee; --bd-all-ink:#0b7a44; --bd-all-line:#b7e2c9;
    --bd-some-bg:#fdf3dd; --bd-some-ink:#8a5b00; --bd-some-line:#eed9a4;
  }
  :root[data-theme="dark"] {
    --bg:#0a111f; --card:#101a2d; --ink:#e6ecf6; --sub:#a3b2c9; --line:#1f2e48;
    --blue:#5b93ff; --gold:#e0aa46; --eyebrow:#8fb4ff; --cap:#7286a1;
    --chip-bg1:#16273f; --chip-bg2:#122036; --chip-line:#2b4a70; --chip-ink:#a5c8ff;
    --note-bg1:#251d09; --note-bg2:#1e1806; --note-line:#4a3c12; --note-ink:#f0cd6d;
    --url-bg:#0e1a2e; --url-line:#2b4262; --url-ink:#bcd3f2;
    --shot-line:#31435e; --rail:#2c4a75;
    --bd-all-bg:#0d281a; --bd-all-ink:#6fd8a2; --bd-all-line:#1c4e33;
    --bd-some-bg:#2a2208; --bd-some-ink:#e8c766; --bd-some-line:#4a3c12;
  }
"""

for lang in ('ja', 'zh'):
    out = os.path.join(BASE, f'docs/ai-course/guide/student-guide-{lang}.html')
    with open(out, 'w') as f:
        f.write(build(lang))
    print(f'ok {out} ({os.path.getsize(out) // 1024}KB)')
