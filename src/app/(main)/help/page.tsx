"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { isGroupLead, isManager } from "@/lib/roles";
import { cn } from "@/lib/utils";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";

/**
 * 사용방법.
 *
 * 긴 설명서는 아무도 안 읽는다. 그래서 "무엇을 하려는가"로 나누고,
 * 보는 사람 역할에 해당하는 것만 펼쳐 둔다. 나머지는 접어 둔다.
 *
 * 화면에 실제로 있는 버튼 이름 그대로 쓴다 — 설명과 화면이 다르면
 * 설명서가 아니라 혼란거리가 된다.
 *
 * 종이로 돌릴 수 있어야 한다. 첫 로그인 안내는 특히 그렇다.
 */

type Who = "all" | "member" | "groupLead" | "lead";

export default function HelpPage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>("first");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setMe(data as Profile);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const lead = isManager(me);
  const gLead = isGroupLead(me);

  /** 이 사람에게 해당하는 내용인가 */
  const mine = (who: Who) =>
    who === "all" ||
    (who === "member" && !lead) ||
    (who === "groupLead" && gLead) ||
    (who === "lead" && lead);

  return (
    <div className="space-y-5 max-w-3xl">
      <PrintHeader title="팀원 업무관리 시스템 — 사용방법" subtitle={me?.name ?? ""} />

      <div className="no-print flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">사용방법</h1>
          <p className="text-sm text-gray-500 mt-0.5 break-keep">
            {me?.name} 님({me?.role})에게 해당하는 것부터 펼쳐뒀습니다. 제목을 누르면 접고 펴집니다.
          </p>
        </div>
        <PrintButton label="사용방법 인쇄" />
      </div>

      {/* 처음 오신 분 — 종이로 돌리는 부분 */}
      <Section
        id="first"
        title="처음 들어오시는 분께"
        open={open}
        setOpen={setOpen}
        badge="제일 먼저"
      >
        <Step n={1} title="메일 주소와 비밀번호 1234 로 로그인">
          아이디는 <b>회사 메일</b>입니다. 처음 비밀번호는 모두 <b>1234</b> 입니다. 본인 PC 라면
          아래 <b>아이디 저장</b>·<b>비밀번호 저장</b>을 체크해 두면 다음부터 편합니다.{" "}
          <b>공용 PC 에서는 체크하지 마세요.</b>
        </Step>
        <Step n={2} title="휴대폰에 인증 앱 깔기">
          휴대폰에서 <b>Google Authenticator</b>(구글 OTP)를 받으세요. 안드로이드는 Play 스토어,
          아이폰은 App Store 에서 찾으면 됩니다.
        </Step>
        <Step n={3} title="화면의 QR 을 앱으로 찍기">
          로그인하면 QR 그림이 뜹니다. 인증 앱에서 <b>+</b> → <b>QR 코드 스캔</b>으로 찍으세요. 앱에
          6자리 숫자가 생기고 30초마다 바뀝니다.
        </Step>
        <Step n={4} title="6자리 넣기">
          앱에 떠 있는 6자리를 화면에 넣으면 등록이 끝납니다.
        </Step>
        <Step n={5} title="내 비밀번호로 바꾸기">
          바로 비밀번호 바꾸는 화면이 나옵니다. <b>1234 는 모두가 아는 번호라 반드시 바꿔야
          합니다.</b> 6자 이상으로 정하세요.
        </Step>
        <p className="mt-3 text-sm text-gray-500 break-keep">
          여기까지 하면 끝입니다. 다음부터는 <b>메일 + 본인 비밀번호 + 6자리</b>로 들어옵니다.
        </p>
      </Section>

      <Section id="login" title="다음부터 로그인할 때" open={open} setOpen={setOpen}>
        <p className="text-sm text-gray-600 break-keep">
          메일과 본인 비밀번호를 넣으면 6자리를 묻습니다. 그때 <b>이 기기 기억</b>을 고를 수
          있습니다.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-600">
          <li>
            · <b>기억 안 함</b> — 들어올 때마다 6자리를 묻습니다. 공용 PC 는 이것으로 두세요.
          </li>
          <li>
            · <b>7일 / 30일 / 90일</b> — 그 기간 동안 이 기기에서는 6자리를 안 묻습니다. 본인
            PC·휴대폰에만 쓰세요. 기본은 30일입니다.
          </li>
        </ul>
        <Tip>
          휴대폰을 바꾸셨거나 인증 앱을 지워서 6자리가 안 맞으면, 팀장에게 말씀하세요. 팀장이
          팀원관리에서 <b>OTP 해제</b>를 눌러주면 처음부터 다시 등록할 수 있습니다.
        </Tip>
        <p className="mt-2 text-sm text-gray-500 break-keep">
          알아두실 점 — 팀장은 <b>팀원관리</b> 화면에서 각자의 <b>마지막 접속 시간</b>과 OTP·비밀번호
          설정을 끝냈는지를 봅니다. 무엇을 보고 있었는지는 남지 않고, 언제 들어왔는지만 남습니다.
        </p>
      </Section>

      {/* 팀원 — 매일 쓰는 것 */}
      <Section
        id="daily"
        title="내 업무 보고 진행 적기"
        open={open}
        setOpen={setOpen}
        highlight={mine("member")}
      >
        <p className="text-sm text-gray-600 break-keep">
          왼쪽 메뉴 <b>내 업무</b>(팀장·그룹장은 <b>업무관리</b>)에 내가 맡은 일이 줄로 쌓입니다.
        </p>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
          <li>
            · <b>칸을 누르면 그 칸만 고치는 작은 창</b>이 뜹니다. 제목, 상세내용, 진행일정,
            완료계획일정, 진행률, 비고 전부 그렇습니다. 화면이 안 넘어가니 보던 자리를 잃지
            않습니다.
          </li>
          <li>
            · <b>진행률</b> 칸을 눌러 숫자를 올리세요. 일이 어디까지 갔는지 이것으로 봅니다.
          </li>
          <li>
            · <b>진행기록</b> 칸을 누르면 그날 뭘 했는지 한 줄 적을 수 있습니다. 이게 쌓여서 주간
            보고가 됩니다. <b>따로 주간보고를 쓸 필요가 없습니다.</b>
          </li>
          <li>
            · 다 끝냈으면 <b>완료</b> 버튼을 누르세요. 오늘 날짜로 완료 처리됩니다.
          </li>
          <li>
            · 줄 끝 <b>보기</b> 를 누르면 그 업무의 전체 내용과 바뀐 이력이 다 보입니다.
          </li>
        </ul>
        <Tip>
          칸 경계를 <b>끌면 폭이 조절</b>됩니다. 업무내용 칸을 넓게 쓰시면 읽기 편합니다. 조절한
          폭은 그 브라우저에 저장돼서 다음에도 유지됩니다.
        </Tip>
      </Section>

      <Section
        id="selfadd"
        title="내가 할 일을 직접 올리기"
        open={open}
        setOpen={setOpen}
        highlight={mine("member")}
      >
        <p className="text-sm text-gray-600 break-keep">
          구두로 받은 지시나 스스로 챙길 일도 올려두셔야 기록에 남습니다. 왼쪽 메뉴{" "}
          <b>내 업무 등록</b>에서 할 일을 편하게 적어 붙여넣으면 건별로 나눠 등록됩니다. 글 속에
          날짜가 있으면 기한도 찾아 넣습니다.
        </p>

        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-semibold text-blue-900">세부 내용은 괄호 ( ) 안에</p>
          <p className="text-sm text-blue-800 mt-1 break-keep">
            제목 한 줄만 있으면 나중에 본인도, 팀장도 무엇을 어디까지 하기로 한 건지 알 수
            없습니다. <b>괄호 안에 적은 글은 제목이 아니라 업무 설명으로 들어갑니다.</b>
          </p>
          <pre className="text-xs text-blue-900 bg-white/70 rounded-lg px-3 py-2 mt-2 whitespace-pre-wrap break-keep">
{`청소대차 진행보고 (대차 수량 확인 후 사진 첨부해서 보고, 9/25까지)

→ 제목   청소대차 진행보고
   설명   대차 수량 확인 후 사진 첨부해서 보고
   기한   9월 25일`}
          </pre>
          <ul className="text-xs text-blue-800 mt-2 space-y-0.5">
            <li>· 괄호가 <b>여러 줄</b>에 걸쳐 있어도 한 건으로 묶입니다</li>
            <li>
              · <b>(2열)</b>, <b>(주)</b> 처럼 짧은 괄호는 제목에 그대로 둡니다
            </li>
            <li>· 등록 전에 오른쪽 미리보기에서 「세부 …」로 확인됩니다</li>
          </ul>
        </div>
        <Tip>
          업무관리 화면의 <b>+ 내 업무 추가</b> 버튼으로 한 건씩 올려도 됩니다.
        </Tip>
      </Section>

      {/* 그룹장 */}
      <Section
        id="grouplead"
        title="그룹장 — 우리 그룹 일 나눠주기"
        open={open}
        setOpen={setOpen}
        highlight={mine("groupLead")}
        badge="그룹장"
      >
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li>
            · 왼쪽 메뉴 <b>업무지시</b>에서 지시 내용을 붙여넣으면 이름과 기한을 찾아 사람별 업무로
            만듭니다. 여러 줄을 한 번에 넣어도 됩니다.
          </li>
          <li>
            · <b>우리 그룹 사람만</b> 고를 수 있습니다. 다른 그룹 업무는 아예 보이지 않습니다.
          </li>
          <li>
            · 업무관리에서 <b>담당자</b> 칸을 눌러 사람을 바꾸거나 더할 수 있습니다. 맨 위에 체크된
            사람이 담당, 나머지는 참여입니다.
          </li>
          <li>
            · 그룹장이 올린 새 업무는 <b>팀장에게 보고로 올라갑니다</b>. 따로 알릴 필요 없습니다.
          </li>
        </ul>
      </Section>

      {/* 팀장 */}
      <Section
        id="lead"
        title="팀장 — 지시, 보고, 팀원 관리"
        open={open}
        setOpen={setOpen}
        highlight={mine("lead")}
        badge="팀장·실장"
      >
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li>
            · <b>업무지시</b> — 주간 지시문을 통째로 붙여넣으면 이름·기한을 찾아 건별로 나눕니다.
            원문도 같이 보관됩니다. <b>세부 내용은 괄호 ( ) 안에</b> 적으시면 제목이 아니라 업무
            설명으로 들어갑니다 — 제목만 주면 받는 사람이 무엇을 어디까지 해야 하는지 몰라 묻지도
            못합니다. 괄호가 여러 줄이어도 한 건으로 묶입니다.
          </li>
          <li>
            · <b>신규 업무 진행 보고</b> — 그룹장·팀원이 새로 올린 업무가 여기로 올라옵니다.{" "}
            <b>확인</b>을 누르면 목록에서 빠집니다(업무가 지워지는 게 아닙니다). 새로 가입한 사람도
            여기 같이 뜹니다.
          </li>
          <li>
            · <b>업무관리</b>에서 팀원 <b>이름을 누르면</b> 그 사람 화면을 그대로 들여다볼 수
            있습니다.
          </li>
          <li>
            · <b>팀원관리 → 그룹</b> 에서 그룹을 만들고 이름을 정하고, 사람을 넣고,{" "}
            <b>그룹장으로</b> 버튼으로 역할을 바꿉니다. 역할을 바꾸는 순간 권한이 생깁니다.
          </li>
          <li>
            · <b>팀원관리 → 팀원 현황</b> 에서 누가 가입 준비(OTP·비밀번호)를 끝냈는지,{" "}
            <b>마지막으로 언제 들어왔는지</b>가 보입니다. 배포 첫 주에 누가 아직 안 들어왔는지
            여기서 확인하세요.
          </li>
          <li>
            · <b>삭제</b> — 팀장은 모든 업무를, 팀원·그룹장은 <b>자기가 직접 올린 업무만</b> 지울 수
            있습니다. 지시받은 업무는 지우지 못합니다(지시는 지시한 사람의 기록이라서). 맡기 어려운
            업무는 담당자를 바꾸거나 팀장에게 말씀하시면 됩니다. 팀장이 지울 때는 비밀번호를 묻습니다.
          </li>
          <li>
            · <b>업무관리 맨 아래 「지워진 업무」</b> — 팀원이 지시받은 업무를 지워도 여기 남습니다.
            누가 언제 무엇을 지웠는지 보이고, <b>되살리기</b>로 되돌릴 수 있습니다. 다만 그 업무의
            진행기록·변경이력은 함께 지워져 돌아오지 않습니다.
          </li>
        </ul>
      </Section>

      <Section
        id="weekly"
        title="주간 계획대비 실적 · 회의 모드"
        open={open}
        setOpen={setOpen}
        highlight={mine("lead")}
      >
        <p className="text-sm text-gray-600 break-keep">
          왼쪽 메뉴 <b>주간 계획대비 실적</b>. 이번 주에 걸린 업무를 자동으로 모읍니다.{" "}
          <b>따로 적을 것이 없습니다.</b> 사람마다 완료·진행중·지연 건수가 찍히고, 업무 밑에 그 주에
          쓴 진행기록이 붙습니다.
        </p>
        <p className="mt-2 text-sm text-gray-600 break-keep">
          오른쪽 위 <b>회의 모드</b>를 누르면 회의실 화면용으로 바뀝니다.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-600">
          <li>
            · <b>화살표 키</b>나 <b>스페이스</b>로 한 사람씩 넘깁니다. 아래 이름을 눌러 바로 갈 수도
            있습니다.
          </li>
          <li>
            · <b>가+ / 가−</b> 로 글자 크기를 맞추고, <b>전체화면</b>으로 키웁니다.
          </li>
          <li>
            · 업무를 누르면 <b>그 자리에서 고쳐집니다.</b> &ldquo;이건 다음 주로&rdquo; 하면 기한만
            바꾸면 됩니다. 회의가 끝나면 정리도 끝납니다.
          </li>
          <li>
            · <b>Esc</b> 로 회의 모드를 나옵니다.
          </li>
        </ul>
        <Tip>
          날짜가 하나도 없는 업무는 어느 주에도 안 잡힙니다. 화면 맨 아래{" "}
          <b>기한 미정</b> 에 모아두니 거기서 날짜를 넣으세요.
        </Tip>
      </Section>

      <Section id="etc" title="달력 · 메모장 · 공지사항" open={open} setOpen={setOpen}>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li>
            · <b>달력</b> — 완료계획일정 기준으로 한 달을 봅니다. 날짜를 누르면 그날 할 일이 다
            보입니다. <b>타임라인</b> 탭에서는 사람별로 언제부터 언제까지인지 막대로 봅니다.
          </li>
          <li>
            · <b>내 메모장</b> — 일하면서 떠오르는 것을 한 줄씩 적어두는 곳입니다. 나만 봅니다.
          </li>
          <li>
            · <b>공지사항</b> — 새 공지가 뜨면 들어올 때 창으로 알려줍니다. 확인을 눌러야 사라집니다.
          </li>
          <li>
            · 어느 화면이든 <b>인쇄</b> 버튼이 있습니다. 메뉴와 버튼은 빠지고 표만 A4 로 나옵니다.
            화면이 어두워도 종이는 늘 흰 바탕 검은 글씨입니다.
          </li>
        </ul>
      </Section>

      <Section id="trouble" title="막힐 때" open={open} setOpen={setOpen}>
        <dl className="space-y-3 text-sm">
          <Q
            q="비밀번호를 잊었습니다"
            a="팀장에게 말씀하세요. 팀장이 새 비밀번호를 정해주면, 본인이 로그인할 때 다시 바꾸라는 화면이 나옵니다."
          />
          <Q
            q="6자리가 안 맞습니다"
            a="휴대폰 시간이 자동으로 맞춰져 있는지 보세요. 그래도 안 되면 팀장이 팀원관리에서 OTP 해제를 눌러주면 처음부터 다시 등록할 수 있습니다."
          />
          <Q
            q="저장해둔 비밀번호로 로그인이 안 됩니다"
            a="비밀번호가 바뀌면 저장해둔 옛 것이 계속 들어갑니다. 한 번 실패하면 저장된 것을 자동으로 지우니, 새 비밀번호를 다시 넣으세요."
          />
          <Q
            q="업무가 안 보입니다"
            a="본인이 담당이나 참여로 체크돼 있어야 보입니다. 그룹이 아직 정해지지 않았으면 본인 업무만 보입니다. 팀장에게 그룹을 정해달라고 하세요."
          />
          <Q
            q="주간표에 내 일이 안 나옵니다"
            a="진행일정이나 완료계획일정이 비어 있으면 어느 주에도 안 잡힙니다. 주간 화면 맨 아래 기한 미정에서 날짜를 넣으세요."
          />
          <Q
            q="지운 업무를 되살리고 싶습니다"
            a="화면에서는 되살릴 수 없지만 내용은 그대로 남아 있습니다. 팀장에게 말씀하시면 찾아드릴 수 있습니다."
          />
        </dl>
      </Section>

      <div className="no-print rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600 break-keep">
          여기에 없는 것이 막히면 팀장에게 말씀해 주세요. 쓰면서 불편한 것도 모아서 고칩니다.
        </p>
        {lead && (
          <Link
            href="/team"
            className="inline-block mt-2 text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            팀원관리로 가기
          </Link>
        )}
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  badge,
  children,
  open,
  setOpen,
  highlight = false,
}: {
  id: string;
  title: string;
  badge?: string;
  children: React.ReactNode;
  open: string | null;
  setOpen: (v: string | null) => void;
  /** 이 사람에게 해당하는 내용이면 눈에 띄게 */
  highlight?: boolean;
}) {
  const isOpen = open === id;
  return (
    <section
      className={cn(
        "rounded-xl border bg-white overflow-hidden print-block",
        highlight ? "border-blue-200" : "border-gray-200"
      )}
    >
      <button
        onClick={() => setOpen(isOpen ? null : id)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="font-bold text-gray-900">{title}</span>
        {badge && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            {badge}
          </span>
        )}
        <span className="flex-1" />
        <span className="no-print text-gray-400 text-sm">{isOpen ? "접기" : "펴기"}</span>
      </button>
      <div className={cn("px-4 pb-4", !isOpen && "hidden print:block")}>{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-b-0">
      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 break-keep">{title}</p>
        <p className="text-sm text-gray-600 mt-0.5 break-keep">{children}</p>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-500 break-keep">
      {children}
    </p>
  );
}

function Q({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-semibold text-gray-900 break-keep">{q}</dt>
      <dd className="text-gray-600 mt-0.5 break-keep">{a}</dd>
    </div>
  );
}
