# 学習者向け「冒険ガイド」の組版（ja主体版・zh主体版の2ファイル）。
# 実行: python3 scripts/ai-course/build-student-guide.py
# 入力: docs/ai-course/guide/img/*-ja.png / *-zh.png（render-guide-shots.tsx + playwright で生成）
# 出力: docs/ai-course/guide/student-guide-ja.html / student-guide-zh.html
#       （画像埋め込みの自己完結1ファイル。WeChat転送・印刷可。ライト/ダーク両対応）
#
# デザイン: アプリ自身の視覚言語（青の冒険マップ・rounded・霧）を紙面に持ち込む。
# ヒーローは「旅の行程図」、STEP1〜4は点線ルートで縦に接続（地図のメタファー）。
import base64
import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(BASE, 'docs/ai-course/guide/img')



def img_tag(name: str, alt: str, width: int = 310) -> str:
    with open(os.path.join(IMG, name), 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    return (f'<figure class="phone"><img src="data:image/png;base64,{b64}" alt="{alt}" '
            f'loading="lazy" style="width:min({width}px,100%)" /></figure>')


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
        'step': one('はじめの10分', '最初的10分钟'),
        'daily': one('毎日のこと', '每天要做的'),
        'why': one('しくみ', '原理'),
        'events': one('節目', '里程碑'),
        'qa': one('よくある不安', '常见的不安'),
        'start': one('はじめる', '开始'),
    }

    url_main = f'https://staging.badminton-platform.pages.dev/{lang}/ai-course?v2=1'
    url_sub = f'https://staging.badminton-platform.pages.dev/{other}/ai-course?v2=1'

    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{one('「日本語の相棒」冒険ガイド', '「你的日语搭档」冒险指南')}</title>
<style>
{CSS_TOKENS}
  * {{ box-sizing:border-box; margin:0; }}
  body {{ font-family:system-ui,-apple-system,"PingFang SC","Hiragino Sans",sans-serif;
    color:var(--ink); background:var(--bg); line-height:1.75; font-size:16px; }}
  main {{ max-width:660px; margin:0 auto; padding:20px 16px 72px; }}

  /* ── ヒーロー: 旅の行程図 ── */
  .hero {{ background:linear-gradient(160deg,var(--deep1),var(--deep2)); color:#fff;
    border-radius:20px; padding:28px 22px 24px; }}
  .brand {{ font-size:.8rem; font-weight:700; letter-spacing:.08em; color:#bfdbfe; }}
  .hero h1 {{ font-size:1.65rem; line-height:1.35; font-weight:800; margin-top:6px; text-wrap:balance; }}
  .hero .p1 {{ color:#dbeafe; font-size:.95rem; margin-top:10px; }}
  .hero .p2 {{ color:#93b4e8; font-size:.82rem; margin-top:4px; }}
  .journey {{ display:flex; align-items:flex-start; margin-top:22px; gap:4px; }}
  .journey .stop {{ flex:none; text-align:center; width:88px; }}
  .journey .dot {{ width:34px; height:34px; margin:0 auto; border-radius:999px;
    background:rgb(255 255 255 / .16); border:2px solid rgb(255 255 255 / .55);
    display:flex; align-items:center; justify-content:center; font-size:.95rem; }}
  .journey .stop.goal .dot {{ background:#fbbf24; border-color:#fde68a; color:#78350f; }}
  .journey .stop b {{ display:block; font-size:.78rem; margin-top:6px; }}
  .journey .stop span {{ display:block; font-size:.68rem; color:#bfdbfe; line-height:1.4; }}
  .journey .leg {{ flex:1; border-top:2px dashed rgb(255 255 255 / .45); margin-top:17px; }}

  /* ── セクション共通 ── */
  section {{ background:var(--card); border:1px solid var(--line); border-radius:18px;
    padding:22px 20px; margin-top:16px; position:relative; }}
  .eyebrow {{ font-size:.7rem; font-weight:800; letter-spacing:.14em; color:var(--blue);
    text-transform:uppercase; }}
  h2 {{ font-size:1.18rem; font-weight:800; margin-top:2px; display:flex; align-items:center; gap:10px;
    text-wrap:balance; }}
  h2 .n {{ flex:none; display:inline-flex; align-items:center; justify-content:center;
    width:30px; height:30px; border-radius:999px; background:var(--blue); color:#fff; font-size:.95rem; }}
  .p1 {{ font-size:.97rem; margin-top:10px; }}
  .p2 {{ font-size:.85rem; color:var(--sub); margin-top:3px; }}

  /* STEP群は点線ルートで縦に接続（地図のメタファー） */
  .route {{ position:relative; }}
  .route::before {{ content:''; position:absolute; left:35px; top:24px; bottom:24px;
    border-left:3px dashed var(--rail); }}
  .route section {{ margin-left:0; }}

  /* ── 画像（スマホフレーム） ── */
  .phone {{ margin:14px auto 2px; text-align:center; }}
  .phone img {{ border:1px solid var(--shot-line); border-radius:16px;
    box-shadow:0 10px 28px rgb(16 32 58 / .12); background:#fff; }}
  .cap {{ text-align:center; font-size:.75rem; color:var(--cap); margin-top:8px; }}

  /* ── 未来パネル ── */
  .future {{ background:linear-gradient(160deg,var(--deep1),var(--deep2)); color:#fff; border:none; }}
  .future .eyebrow {{ color:#93c5fd; }}
  .future h2 {{ color:#fff; }}
  .future ul {{ padding:0; margin-top:10px; }}
  .future li {{ margin:10px 0 0; list-style:none; padding-left:30px; position:relative; font-size:.97rem; }}
  .future li::before {{ content:"✓"; position:absolute; left:4px; color:#6ee7b7; font-weight:800; }}
  .future .lsub {{ display:block; font-size:.82rem; color:#93b4e8; }}
  .honest {{ font-size:.75rem; color:#93b4e8; margin-top:16px; border-top:1px solid rgb(255 255 255 / .18);
    padding-top:12px; }}

  /* ── ループ図・チップ ── */
  .flow {{ display:flex; gap:6px; align-items:stretch; margin-top:14px; }}
  .flow > div {{ flex:1; background:var(--chip-bg); border:1px solid var(--chip-line); border-radius:12px;
    padding:10px 6px; text-align:center; font-size:.8rem; font-weight:700; color:var(--chip-ink); }}
  .flow > div span {{ display:block; font-size:.68rem; font-weight:400; margin-top:2px; opacity:.75; }}
  .flow > .arrow {{ flex:none; align-self:center; background:none; border:none; color:var(--cap);
    padding:0; font-weight:400; }}

  .note {{ background:var(--note-bg); border:1px solid var(--note-line); border-radius:12px;
    padding:11px 13px; font-size:.85rem; color:var(--note-ink); margin-top:14px; }}
  .note b {{ display:block; font-size:.72rem; letter-spacing:.1em; margin-bottom:2px; }}

  .why {{ counter-reset:why; }}
  .why .mech {{ margin-top:16px; padding-left:38px; position:relative; }}
  .why .mech::before {{ counter-increment:why; content:counter(why);
    position:absolute; left:0; top:2px; width:26px; height:26px; border-radius:999px;
    background:var(--chip-bg); border:1px solid var(--chip-line); color:var(--chip-ink);
    display:flex; align-items:center; justify-content:center; font-size:.8rem; font-weight:800; }}
  .why .mech .p1 {{ margin-top:0; }}

  .qa dt {{ font-weight:800; font-size:.93rem; margin-top:16px; padding-left:30px; position:relative; }}
  .qa dt::before {{ content:"Q"; position:absolute; left:0; top:1px; width:22px; height:22px;
    border-radius:7px; background:var(--chip-bg); border:1px solid var(--chip-line); color:var(--chip-ink);
    display:flex; align-items:center; justify-content:center; font-size:.72rem; }}
  .qa dd {{ margin:4px 0 0 30px; }}

  .url {{ background:var(--url-bg); border-radius:12px; padding:12px 14px;
    font-family:ui-monospace,monospace; font-size:.82rem; word-break:break-all; margin-top:10px;
    border:1px solid var(--line); }}
  footer {{ text-align:center; font-size:.75rem; color:var(--cap); margin-top:30px; }}
</style></head><body><main>

<div class="hero">
  <p class="brand">{one('日本語の相棒 ｜ 你的日语搭档', '你的日语搭档 ｜ 日本語の相棒')}</p>
  <h1>{one('冒険ガイド — 何から始めて、どこへ辿り着くのか', '冒险指南 — 从哪里开始，到达哪里')}</h1>
  {t('このガイド1枚で、最初の10分・毎日の15分・5か月後の姿まで、旅の全体が分かります。',
     '这一页指南，让你看清最初的10分钟、每天的15分钟、以及5个月后的自己。')}
  <div class="journey">
    <div class="stop"><div class="dot">1</div><b>{one('今日', '今天')}</b><span>{one('ルート作り 10分', '生成路线 10分钟')}</span></div>
    <div class="leg"></div>
    <div class="stop"><div class="dot">∞</div><b>{one('毎日', '每天')}</b><span>{one('ボタン1つ 15分', '一个按钮 15分钟')}</span></div>
    <div class="leg"></div>
    <div class="stop goal"><div class="dot">⚑</div><b>{one('5か月後', '5个月后')}</b><span>{one('N2・面接・会話', 'N2・面试・会话')}</span></div>
  </div>
</div>

<section class="future">
  <p class="eyebrow">{one('目的地', '目的地')}</p>
  <h2>{one('5か月後のあなた', '5个月后的你')}</h2>
  <ul>
    <li>{one('N2の問題を、本番と同じ時間の感覚で解けるようになっている', '能以接近真实考试的时间感觉解答N2题目')}
      <span class="lsub">{one('能以接近真实考试的时间感觉解答N2题目', 'N2の問題を、本番と同じ時間の感覚で解ける')}</span></li>
    <li>{one('帰化面接で聞かれることに、自分の言葉の日本語で答えられる', '面对入籍面试的提问，能用自己的话作答')}
      <span class="lsub">{one('面对入籍面试的提问，能用自己的话作答', '帰化面接で聞かれることに、自分の言葉で答えられる')}</span></li>
    <li>{one('毎日AIと話してきたから、日本語で話し出すことが怖くなくなっている', '因为每天都和AI对话，开口说日语不再可怕')}
      <span class="lsub">{one('因为每天都和AI对话，开口说日语不再可怕', '毎日AIと話してきたから、話し出すことが怖くない')}</span></li>
  </ul>
  <p class="honest">{one('※ 合格を保証するものではありません。ただ、そこへ向かう毎日の道は、私たちが用意します。',
    '※ 不构成合格保证。但通往目标的每一天，由我们来安排。')}</p>
</section>

<div class="route">
<section>
  <p class="eyebrow">{eyebrow['step']}</p>
  <h2><span class="n">1</span>{one('招待コードでログイン（初回だけ）', '用邀请码登录（仅首次）')}</h2>
  {t('先生から届いた<b>リンク・招待コード</b>を使ってログインします。メールに届く8桁の数字を入れるだけ。パスワードはありません。',
     '用老师发来的<b>链接和邀请码</b>登录。输入邮箱收到的8位数字即可，没有密码。')}
  {shot('step0-login', 'ログイン画面')}
  <p class="cap">{one('2回目からは招待コード不要・自動ログイン', '第二次起无需邀请码，自动登录')}</p>
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
  {t('冒険の目的（JLPT合格・会話・両方）を選び、そのあと12問＋短い作文の診断で「今のあなたの現在地」を測ります。',
     '选择冒险目的（JLPT合格・会话・两者都要），然后通过12道题＋简短写作，测出「你现在的位置」。')}
  {shot('step2-goal', '目的選択画面')}
  <div class="note"><b>{one('あんしん', '放心')}</b>{one(
    'わからない問題は「わからない」でOK。正確なルートを作るための測定なので、できなくてもまったく問題ありません。',
    '不会的题选「不知道」就好。这只是为了生成准确路线的测量，不会做完全没关系。')}</div>
</section>

<section>
  <p class="eyebrow">{eyebrow['step']}</p>
  <h2><span class="n">4</span>{one('あなた専用の攻略ルートが完成', '生成你的专属攻略路线')}</h2>
  {t('診断が終わると<b>成長マップ</b>ができます。現在地・次の目的地・最終目的地が地図になり、進むほど霧が晴れていきます。',
     '诊断结束后生成<b>成长地图</b>。当前位置、下一个目的地、最终目的地都画在地图上，越前进迷雾越散。')}
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

  <div class="mech">{t('<b>この毎日が、5か月後につながります。</b>毎日の復習→覚えたことが試験日まで残る。時間つきのバトルと模試→本番の時間感覚。毎日のAI会話と言い直し練習→面接や生活で「自分の言葉」が出る。',
    '<b>这样的每一天，通向5个月后。</b>每天的复习→学过的内容保持到考试当天。限时的战斗和模拟考→真实考试的时间感觉。每天的AI会话和改口练习→面试和生活中说得出「自己的话」。')}</div>
</section>

<section>
  <p class="eyebrow">{eyebrow['events']}</p>
  <h2>{one('節目のイベント（コースによって）', '里程碑（因课程而异）')}</h2>
  {t('<b>ミニ模試（全員）</b>: 時間つきで4技能を測り、準備度に反映されます。',
     '<b>迷你模拟考（所有人）</b>: 限时测4项技能，反映到准备度。')}
  {t('<b>過去問の試験場（N2コースの人だけ）</b>: 先生からWeChatで届く本物の過去問を、本番と同じ制限時間で解いて、アプリのマークシートに記入します。',
     '<b>真题考场（仅N2课程）</b>: 老师通过微信发来真题，按真实考试的限时作答，答案填在应用的答题卡上。')}
  {shot('sheets-marking', '過去問のマークシート')}
  {t('<b>帰化面接の表現特訓（対象の人だけ）</b>: 面接で聞かれそうな30問を「自分の言葉」で言える状態にします。模擬面接そのものは先生の授業で行います。',
     '<b>入籍面试表达特训（仅对象学员）</b>: 把面试可能被问的30个问题，练到能「用自己的话」说出来。模拟面试在老师的课上进行。')}
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
    <dt>{one('スマホでできますか？', '手机能用吗？')}</dt>
    <dd>{t('できます。iPhone・Androidのブラウザで動きます。会話練習はマイクを使います。',
           '可以。iPhone・Android的浏览器都能用。会话练习会用到麦克风。')}</dd>
    <dt>{one('困ったら？', '遇到问题怎么办？')}</dt>
    <dd>{t('WeChatで先生にいつでも聞いてください。', '随时在微信上问老师。')}</dd>
  </dl>
</section>

<section>
  <p class="eyebrow">{eyebrow['start']}</p>
  <h2>{one('はじめる', '开始你的冒险')}</h2>
  {t('あなたの招待コードと一緒に、このリンクを開いてください。', '请和你的邀请码一起，打开这个链接。')}
  <div class="url">{url_main}</div>
  <p class="cap">{one(f'中国語表示 → {url_sub}', f'日语界面 → {url_sub}')}</p>
</section>

<footer>{one('日本語の相棒 / 你的日语搭档 — 冒険ガイド', '你的日语搭档 / 日本語の相棒 — 冒险指南')}</footer>
</main></body></html>"""


# CSSトークン（ライト/ダーク。@media と data-theme の両方で上書き）
CSS_TOKENS = """
  :root {
    --bg:#f4f7fb; --card:#ffffff; --ink:#10203a; --sub:#51617a; --line:#dfe7f2;
    --blue:#2563eb; --deep1:#1d4ed8; --deep2:#1e3a8a; --cap:#8fa0b8;
    --chip-bg:#eff6ff; --chip-line:#c7dbfa; --chip-ink:#1e40af;
    --note-bg:#fff8e6; --note-line:#f5dfa1; --note-ink:#8a5b00;
    --url-bg:#eaf1fa; --shot-line:#c9d6e8; --rail:#bfdbfe;
  }
  @media (prefers-color-scheme: dark) { :root {
    --bg:#0b1322; --card:#111c30; --ink:#e4eaf4; --sub:#93a4bd; --line:#20304a;
    --blue:#4d8dff; --cap:#64748b;
    --chip-bg:#15263f; --chip-line:#254468; --chip-ink:#9cc3ff;
    --note-bg:#241c07; --note-line:#4a3c12; --note-ink:#f3cf6b;
    --url-bg:#0f1a2e; --shot-line:#31435e; --rail:#2c4a75;
  } }
  :root[data-theme="light"] {
    --bg:#f4f7fb; --card:#ffffff; --ink:#10203a; --sub:#51617a; --line:#dfe7f2;
    --blue:#2563eb; --cap:#8fa0b8;
    --chip-bg:#eff6ff; --chip-line:#c7dbfa; --chip-ink:#1e40af;
    --note-bg:#fff8e6; --note-line:#f5dfa1; --note-ink:#8a5b00;
    --url-bg:#eaf1fa; --shot-line:#c9d6e8; --rail:#bfdbfe;
  }
  :root[data-theme="dark"] {
    --bg:#0b1322; --card:#111c30; --ink:#e4eaf4; --sub:#93a4bd; --line:#20304a;
    --blue:#4d8dff; --cap:#64748b;
    --chip-bg:#15263f; --chip-line:#254468; --chip-ink:#9cc3ff;
    --note-bg:#241c07; --note-line:#4a3c12; --note-ink:#f3cf6b;
    --url-bg:#0f1a2e; --shot-line:#31435e; --rail:#2c4a75;
  }
"""

for lang in ('ja', 'zh'):
    out = os.path.join(BASE, f'docs/ai-course/guide/student-guide-{lang}.html')
    with open(out, 'w') as f:
        f.write(build(lang))
    print(f'ok {out} ({os.path.getsize(out) // 1024}KB)')
