# 学習者向け「冒険ガイド」の組版。
# 実行: python3 scripts/ai-course/build-student-guide.py
# 入力: docs/ai-course/guide/img/*.png（render-guide-shots.tsx + playwright で生成）
# 出力: docs/ai-course/guide/student-guide.html（画像埋め込みの自己完結1ファイル。WeChat転送・印刷可）
import base64
import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(BASE, 'docs/ai-course/guide/img')
OUT = os.path.join(BASE, 'docs/ai-course/guide/student-guide.html')


def img(name: str, alt: str, width: int = 300) -> str:
    with open(os.path.join(IMG, name), 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    return (f'<img src="data:image/png;base64,{b64}" alt="{alt}" loading="lazy" '
            f'style="width:min({width}px,100%)" class="shot" />')


# ja本文＋zh併記（学習者は中国語ネイティブ。先生の確認はja）
def sec(ja: str, zh: str) -> str:
    return f'<p class="ja">{ja}</p><p class="zh">{zh}</p>'


HTML = f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>「日本語の相棒」冒険ガイド</title>
<style>
  :root {{ --ink:#0f172a; --sub:#475569; --blue:#2563eb; --line:#e2e8f0; }}
  * {{ box-sizing:border-box; margin:0; }}
  body {{ font-family:system-ui,sans-serif; color:var(--ink); background:#f8fafc; line-height:1.7; }}
  main {{ max-width:640px; margin:0 auto; padding:24px 16px 64px; }}
  h1 {{ font-size:1.5rem; line-height:1.4; }}
  h2 {{ font-size:1.15rem; margin:0 0 4px; display:flex; align-items:center; gap:8px; }}
  h2 .n {{ flex:none; display:inline-flex; align-items:center; justify-content:center;
    width:28px; height:28px; border-radius:999px; background:var(--blue); color:#fff; font-size:.9rem; }}
  section {{ background:#fff; border:1px solid var(--line); border-radius:16px; padding:20px 18px; margin-top:14px; }}
  .ja {{ font-size:.95rem; margin-top:6px; }}
  .zh {{ font-size:.9rem; color:var(--sub); margin-top:4px; }}
  .shot {{ display:block; margin:12px auto 4px; border:1px solid #cbd5e1; border-radius:14px;
    box-shadow:0 6px 20px rgb(15 23 42 / .10); }}
  .cap {{ text-align:center; font-size:.75rem; color:#94a3b8; margin-top:6px; }}
  .future {{ background:linear-gradient(180deg,#1d4ed8,#1e40af); color:#fff; border:none; }}
  .future h2, .future .ja {{ color:#fff; }}
  .future .zh {{ color:#bfdbfe; }}
  .future li {{ margin:8px 0 0 0; list-style:none; padding-left:28px; position:relative; font-size:.95rem; }}
  .future li::before {{ content:"✓"; position:absolute; left:4px; color:#86efac; font-weight:700; }}
  .future .lizh {{ font-size:.85rem; color:#bfdbfe; padding-left:28px; }}
  .honest {{ font-size:.75rem; color:#bfdbfe; margin-top:14px; }}
  .flow {{ display:flex; gap:6px; align-items:stretch; margin-top:14px; }}
  .flow div {{ flex:1; background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px;
    padding:10px 8px; text-align:center; font-size:.8rem; font-weight:700; color:#1e40af; }}
  .flow span {{ display:block; font-size:.7rem; font-weight:400; color:#3b82f6; margin-top:2px; }}
  .arrow {{ align-self:center; color:#94a3b8; flex:none; }}
  .qa dt {{ font-weight:700; font-size:.92rem; margin-top:14px; }}
  .qa dd {{ margin:2px 0 0; }}
  .note {{ background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px 12px;
    font-size:.85rem; color:#92400e; margin-top:12px; }}
  .url {{ background:#f1f5f9; border-radius:10px; padding:10px 12px; font-family:ui-monospace,monospace;
    font-size:.8rem; word-break:break-all; margin-top:8px; }}
  footer {{ text-align:center; font-size:.75rem; color:#94a3b8; margin-top:28px; }}
</style></head><body><main>

<h1>「日本語の相棒」冒険ガイド</h1>
{sec('何から始めて、毎日何をして、どこへ辿り着くのか。このガイド1枚で全体が分かります。',
     '从哪里开始、每天做什么、最终到达哪里——这一页就能看懂全部。')}

<section class="future">
  <h2>🎯 5か月後のあなた</h2>
  <ul>
    <li>N2の問題を、本番と同じ時間の感覚で解けるようになっている
      <span class="lizh">能以接近真实考试的时间感觉解答N2题目</span></li>
    <li>帰化面接で聞かれることに、自分の言葉の日本語で答えられる
      <span class="lizh">面对入籍面试的提问，能用自己的话作答</span></li>
    <li>毎日AIと話してきたから、日本語で話し出すことが怖くなくなっている
      <span class="lizh">因为每天都和AI对话，开口说日语不再可怕</span></li>
  </ul>
  <p class="honest">※ 合格を保証するものではありません。ただ、そこへ向かう毎日の道は、私たちが用意します。
  ／不构成合格保证。但通往目标的每一天，由我们来安排。</p>
</section>

<section>
  <h2>全体の流れ</h2>
  <div class="flow">
    <div>最初の10分<span>ルート作り</span></div>
    <div class="arrow">→</div>
    <div>毎日15分<span>ボタン1つ</span></div>
    <div class="arrow">→</div>
    <div>節目<span>模試・過去問・面接</span></div>
  </div>
  {sec('大事なこと: <b>迷う場面がありません</b>。目的地はあなたが選び、現在地はAIが測り、今日やることはAIが決めて出します。',
       '重要的一点：<b>你不会迷路</b>。目的地由你选，当前位置由AI测，今天做什么由AI安排好。')}
</section>

<section>
  <h2><span class="n">1</span>招待コードでログイン（初回だけ）</h2>
  {sec('先生から届いた<b>リンク・招待コード</b>を使ってログインします。メールに届く8桁の数字を入れるだけ。パスワードはありません。',
       '用老师发来的<b>链接和邀请码</b>登录。输入邮箱收到的8位数字即可，没有密码。')}
  {img('step0-login-ja.png', 'ログイン画面')}
  <p class="cap">2回目からは招待コード不要・自動ログイン／第二次起无需邀请码，自动登录</p>
</section>

<section>
  <h2><span class="n">2</span>名前を入れる（10秒）</h2>
  {sec('聞かれるのは<b>名前だけ</b>。長いアンケートはありません。',
       '只问<b>名字</b>，没有冗长的问卷。')}
  {img('step1-name-ja.png', '名前入力画面')}
</section>

<section>
  <h2><span class="n">3</span>目的を選んで、現在地を測る（約10分）</h2>
  {sec('冒険の目的（JLPT合格・会話・両方）を選び、そのあと12問＋短い作文の診断で「今のあなたの現在地」を測ります。',
       '选择冒险目的（JLPT合格・会话・两者都要），然后通过12道题＋简短写作，测出「你现在的位置」。')}
  {img('step2-goal-ja.png', '目的選択画面')}
  <div class="note">わからない問題は「わからない」でOK。正確なルートを作るための測定なので、できなくてもまったく問題ありません。
  ／不会的题选「不知道」就好。这只是为了生成准确路线，不会做完全没关系。</div>
</section>

<section>
  <h2><span class="n">4</span>あなた専用の攻略ルートが完成</h2>
  {sec('診断が終わると<b>成長マップ</b>ができます。現在地・次の目的地・最終目的地（例: N2ソラノ塔）が地図になり、進むほど霧が晴れていきます。',
       '诊断结束后会生成<b>成长地图</b>。当前位置、下一个目的地、最终目的地（如: N2索拉诺塔）都在地图上，越前进迷雾越散。')}
  {img('map-top-ja.png', '成長マップ')}
  <p class="cap">定着率は実際に測った数字だけを表示（盛りません）／巩固度只显示实测数字（不夸大）</p>
</section>

<section>
  <h2><span class="n">5</span>毎日は、この青いボタンを押すだけ（約15分）</h2>
  {sec('毎日ホームを開くと「今日の一歩」が用意されています。<b>押すボタンは1つ</b>。今日やる3つ（復習→新しい文法→問題バトル など）はAIが決めてあります。',
       '每天打开首页，「今天的一步」已经准备好。<b>只需按一个按钮</b>。今天的3项（复习→新语法→题目战斗等）由AI安排。')}
  {img('today-cta-ja.png', '今日の一歩', 320)}
  {sec('中身の例＝問題バトル。答えるとすぐに正解と「なぜ」の解説が出ます。まちがえた問題は自動で復習と明日の冒険に入ります。',
       '内容示例＝题目战斗。作答后立即显示正确答案和「为什么」。答错的题会自动进入复习和明天的冒险。')}
  {img('daily-battle-ja.png', '問題バトル')}
  <div class="note">途中でやめても、終わったところまで自動保存。次に開くと続きから始まります。毎日できなくても大丈夫（霧が少し戻るだけ。責められません）。
  ／中途退出也会自动保存，下次从接续处继续。偶尔没做也没关系（只是迷雾稍微回来一点，不会被责备）。</div>
</section>

<section>
  <h2><span class="n">6</span>節目のイベント（コースによって）</h2>
  {sec('<b>ミニ模試（全員）</b>: 時間つきで4技能を測り、準備度に反映されます。',
       '<b>迷你模拟考（所有人）</b>: 限时测4项技能，反映到准备度。')}
  {sec('<b>過去問の試験場（N2コースの人だけ）</b>: 先生からWeChatで届く本物の過去問を、本番と同じ制限時間で解いて、アプリのマークシートに記入します。',
       '<b>真题考场（仅N2课程）</b>: 老师通过微信发来真题，按真实考试的限时作答，答案填在应用的答题卡上。')}
  {img('sheets-marking-ja.png', '過去問のマークシート')}
  {sec('<b>帰化面接の表現特訓（対象の人だけ）</b>: 面接で聞かれそうな30問を「自分の言葉」で言える状態にします。模擬面接そのものは先生の授業で行います。',
       '<b>入籍面试表达特训（仅对象学员）</b>: 把面试可能被问的30个问题，练到能「用自己的话」说出来。模拟面试在老师的课上进行。')}
  {img('interview-home-ja.png', '帰化面接の表現特訓')}
  {sec('そして<b>先生（安田翔）のレッスン</b>。システムがあなたの記録を先生に渡すので、レッスンでは難しいところだけを人が集中して直します。',
       '还有<b>老师（安田翔）的课</b>。系统会把你的学习记录交给老师，课上由真人集中解决难点。')}
</section>

<section>
  <h2>🔬 なぜ、この15分で伸びるのか</h2>
  {sec('「毎日押しているだけで、本当に力がついているの？」——大事な疑問なので、仕組みをそのまま説明します。',
       '「每天按一下按钮，真的在进步吗？」——这是很重要的疑问，所以我们把机制原样讲给你听。')}

  {sec('<b>① 今日の3つは、あなたの記録から選ばれています。</b>AIは「忘れかけていることば」「いまのルートで次に必要な文法」「まちがえたばかりの問題」を毎朝選び直します。だれにでも同じ教材を配っているのではありません。',
       '<b>① 今天的3项，是从你的记录里选出来的。</b>AI每天重新挑选「快要忘记的词」「当前路线下一步需要的语法」「刚答错的题」。不是给所有人发同样的教材。')}
  <div class="flow">
    <div>学ぶ<span>新しい文法・ことば</span></div>
    <div class="arrow">→</div>
    <div>使う<span>問題バトルで確認</span></div>
    <div class="arrow">→</div>
    <div>まちがえる<span>自動で回収</span></div>
    <div class="arrow">→</div>
    <div>忘れた頃に復習<span>定着させる</span></div>
  </div>
  <p class="cap">まちがえた問題は自動で復習と明日の冒険に入り、忘れかけたタイミングでもう一度出ます<br>／答错的题会自动进入复习和明天的冒险，在快忘记的时候再次出现</p>

  {sec('<b>② まぐれでは先に進めません。</b>マップが「攻略済み」になる条件は、<b>別の日に3回、80%以上</b>。しかも初めて見る問題を含めて、問い方も変えて出します。さらに7日後にもう一度確認します。だから、マップで晴れた霧は「本当に身についた証拠」です。',
       '<b>② 靠运气无法前进。</b>地图变成「已攻略」的条件是：<b>不同的3天、都答对80%以上</b>，而且包含第一次见的题、换着问法出题，7天后还会再确认一次。所以地图上散去的迷雾，就是「真正学会的证据」。')}

  {sec('<b>③ 試験と同じ4技能で記録しています。</b>文法・語彙・読解・聴解（実際の音声）を、JLPTの試験科目と同じ区分で測ります。文法だけ満点でも「総合準備度」は出ません。弱い技能があれば、AIがそれを今日の冒険に混ぜてバランスを直します。',
       '<b>③ 按考试的4项技能记录。</b>语法・词汇・阅读・听力（真实音频）按JLPT考试科目同样的区分来测。只有语法满分不会显示「综合准备度」。哪项弱，AI就会把它混进今天的冒险来纠正平衡。')}

  {sec('<b>④ この毎日が、5か月後につながります。</b>毎日の復習→覚えたことが試験日まで残る。時間つきのバトルと模試→本番の時間感覚。毎日のAI会話と言い直し練習→面接や生活で「自分の言葉」が出る。',
       '<b>④ 这样的每一天，通向5个月后。</b>每天的复习→学过的内容保持到考试当天。限时的战斗和模拟考→真实考试的时间感觉。每天的AI会话和改口练习→面试和生活中能说出「自己的话」。')}
</section>

<section class="qa">
  <h2>よくある不安</h2>
  <dl>
    <dt>Q. 忙しくて毎日できなかったら？</dt>
    <dd>{sec('大丈夫。開いた日から続きが始まります。記録が消えることはありません。',
             '没关系。哪天打开就从哪天继续，记录不会消失。')}</dd>
    <dt>Q. 診断でぜんぜん解けなかったら恥ずかしい…</dt>
    <dd>{sec('診断はテストではなく「地図を作る測量」です。できないことが分かるほど、ルートが正確になります。',
             '诊断不是考试，而是「绘制地图的测量」。越是暴露不会的地方，路线越准确。')}</dd>
    <dt>Q. スマホでできますか？</dt>
    <dd>{sec('できます。iPhone・Androidのブラウザで動きます。会話練習はマイクを使います。',
             '可以。iPhone・Android的浏览器都能用。会话练习会用到麦克风。')}</dd>
    <dt>Q. 困ったら？</dt>
    <dd>{sec('WeChatで先生にいつでも聞いてください。',
             '随时在微信上问老师。')}</dd>
  </dl>
</section>

<section>
  <h2>はじめる</h2>
  {sec('あなたの招待コードと一緒に、このリンクを開いてください。', '请和你的邀请码一起，打开这个链接。')}
  <div class="url">https://staging.badminton-platform.pages.dev/zh/ai-course?v2=1</div>
  <p class="cap">日本語表示 → /ja/ai-course?v2=1</p>
</section>

<footer>日本語の相棒 / 你的日语搭档 — 冒険ガイド</footer>
</main></body></html>"""

with open(OUT, 'w') as f:
    f.write(HTML)
print(f'ok {OUT} ({os.path.getsize(OUT) // 1024}KB)')
