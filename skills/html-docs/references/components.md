# 컴포넌트 카탈로그

`assets/template.html` 의 CSS에 이미 들어 있는 클래스들이다. 새 CSS를 만들기 전에 여기서 고른다.
모든 컴포넌트는 `<section class="card">` 안에 넣는다. 예시 값은 전부 자리표시용이다.

## 섹션

```html
<section class="card" id="topic">
  <h2><span class="num">4</span>섹션 제목</h2>
  <p class="sub">이 섹션에서 무엇을 보는지 한 줄.</p>
  <h3 id="topic-detail">하위 절 제목</h3>  <!-- 사이드바 ol.subs 에 data-target="topic-detail" 로 연결 -->
  <p>본문</p>
</section>
```

## 카드 그리드 (요약, 비교)

`g3` 는 3열, `g2` 는 2열. 좁은 화면에서는 1열로 접힌다.

```html
<div class="grid g2">
  <div class="box">
    <div class="k">라벨</div>
    <div class="t">핵심 한 문장</div>
    <p>보충 설명</p>
  </div>
  <div class="box">
    <div class="k" style="color:var(--soft)">이전 방식</div>  <!-- 비교 대상은 흐린 라벨 -->
    <div class="t">핵심 한 문장</div>
    <p>보충 설명</p>
  </div>
</div>
```

## 숫자 카드

4열, 좁은 화면에서 2열.

```html
<div class="stats">
  <div class="stat"><div class="v">42.0%</div><div class="l">지표 설명 (분모 포함)</div></div>
  <div class="stat"><div class="v">1,234건</div><div class="l">지표 설명</div></div>
</div>
```

## 강조 박스

색: `c-blue`(핵심/결론), `c-red`(위험/주의), `c-orange`(확인 필요), `c-green`(완료/확정), `c-grey`(참고).

```html
<div class="callout c-orange"><b class="h">확인 필요</b>본문</div>
```

## 표

가로로 넘치면 스크롤되도록 `.tbl` 로 감싼다. 첫 열 폭은 `style="width:..%"` 로 고정한다.

```html
<div class="tbl"><table>
  <tr><th style="width:26%">항목</th><th>설명</th><th style="width:14%">상태</th></tr>
  <tr><td><b>항목명</b></td><td>설명 <code>값</code></td><td><span class="tag t-now">진행 중</span></td></tr>
</table></div>
```

## 태그

| 클래스 | 용도 |
|---|---|
| `t-done` | 완료 |
| `t-now` | 진행 중 |
| `t-wait` | 대기/외부 의존 |
| `t-todo` | 예정 |
| `t-high` / `t-mid` / `t-low` | 우선순위 |

```html
<span class="tag t-high">높음</span>
```

## 단계 (할 일 순서)

지금 할 단계에 `focus` 를 붙이면 번호가 진하게 칠해진다.

```html
<ol class="steps">
  <li class="step focus">
    <div class="n">1</div>
    <div>
      <h4>단계 제목 (기한)</h4>
      <div class="why">이 단계를 먼저 하는 이유</div>
      <ul class="chk">
        <li>할 일 <span class="who">담당자</span></li>
        <li>할 일</li>
      </ul>
    </div>
  </li>
  <li class="step">...</li>
</ol>
```

`ul.chk` 는 단계 밖에서도 체크리스트로 쓸 수 있다.

## 다이어그램

SVG 내용은 `diagram-design` 스킬로 만든다. 넓은 그림은 `min-width` 를 줘서 좁은 화면에서 가로 스크롤되게 한다.

```html
<figure class="diagram">
  <div class="dwrap">
    <svg viewBox="0 0 1000 480" width="100%" style="min-width:760px" role="img" xmlns="http://www.w3.org/2000/svg" font-family="'Pretendard','Apple SD Gothic Neo',sans-serif">...</svg>
  </div>
  <figcaption>그림 1. 그림이 말하는 내용 한 문장.</figcaption>
</figure>
```

## 화면 캡처

이미지는 문서 옆 `assets/` 에 두고 상대경로로 쓴다. 캡션에 출처(문서명, 쪽수)를 적는다. 가로로 긴 이미지는 `narrow` 로 폭을 제한한다.

```html
<figure class="shot narrow">
  <img src="assets/example-screen.jpg" alt="화면 설명" loading="lazy">
  <figcaption>화면 설명 (출처 문서명 12쪽)</figcaption>
</figure>
```

캡처 옆에 설명을 붙일 때는 `g-shot` (왼쪽 240px 이미지, 오른쪽 본문):

```html
<div class="grid g-shot">
  <figure class="shot" style="margin:0">
    <img src="assets/example-phone.jpg" alt="화면 설명" loading="lazy">
    <figcaption>캡션</figcaption>
  </figure>
  <div>
    <p>설명</p>
  </div>
</div>
```

## 코드 블록

`<pre>` 는 페이지 하단 스크립트가 자동으로 하이라이팅한다(주석, 문자열, JSON 키, 숫자, 키워드, 태그). 내용은 HTML 이스케이프(`&lt;`, `&gt;`, `&amp;`)해서 넣는다.

```html
<pre>// 요청 예시
POST /api/v1/orders
{
  "orderId": "&lt;응답을 봐야 아는 값&gt;",
  "amount": 10000
}</pre>
```

하이라이팅을 직접 넣었거나 끄고 싶으면 `class="raw"` 를 붙인다.

## 에러 로그 / 터미널 블록

`pre.raw` 에 span 클래스를 직접 넣는다: `k`(키), `s`(문자열), `n`(숫자), `p`(구두점), `c`(주석). 핵심 부분은 `mark.m1`(빨강) / `m2`(주황) / `m3`(파랑) 으로 칠하고 아래에 범례를 붙인다.

```html
<div class="term">
  <div class="bar"><span>POST /api/v1/orders</span><span class="badge">400 Bad Request</span></div>
<pre class="raw"><span class="p">{</span>
  <span class="k">"code"</span><span class="p">:</span> <span class="s"><mark class="m1">"INVALID_AMOUNT"</mark></span><span class="p">,</span>
  <span class="k">"field"</span><span class="p">:</span> <span class="s"><mark class="m2">"amount"</mark></span>
<span class="p">}</span></pre>
</div>
<div class="term-legend"><span><i class="m1"></i>에러 코드</span><span><i class="m2"></i>문제 필드</span></div>
<p style="font-size:14px;color:var(--muted);margin-top:6px">원문을 가공했으면 여기에 적는다.</p>
```

## 접기 (Q&A, 부록)

본문 흐름에 꼭 필요하지 않은 근거, 긴 원문, FAQ는 접어 둔다.

```html
<details>
  <summary>Q. 질문</summary>
  <p>답변</p>
</details>
```

## 보조 텍스트

- 담당자 표시: `<span class="who">이름</span>`
- 표/블록 아래 작은 설명: `<p style="font-size:14px;color:var(--muted)">...</p>`
