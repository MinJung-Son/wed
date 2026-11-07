/**
 * 모바일 청첩장 RSVP 저장용 Google Apps Script
 * ------------------------------------------------------------
 * 이 코드는 GitHub 에 올리는 사이트 코드가 아니라,
 * "구글 스프레드시트 > 확장 프로그램 > Apps Script" 에 붙여넣는 코드입니다.
 * (자세한 방법은 README.md 의 'RSVP 저장 기능 연결' 참고)
 *
 * 비밀 키나 비밀번호가 필요 없습니다.
 * 응답은 '내 구글 계정의 스프레드시트'에만 쌓이고, 내용을 볼 수 있는 사람은 나뿐입니다.
 */

var SHEET_NAME = '응답';
var HEADERS = ['접수시각', '성함', '참석여부', '동행인원', '식사여부', '기기ID'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 동시에 여러 명이 제출해도 줄이 겹치지 않게 순서대로 처리

    var raw = (e && e.postData && e.postData.contents) || '{}';
    var data = JSON.parse(raw);

    // 자동 입력 프로그램(봇)이 채우는 숨은 칸이 차 있으면 저장하지 않습니다.
    if (data.website) return json_({ ok: true });

    var name = clean_(data.name, 30);
    var attend = data.attend === 'yes' ? 'yes' : (data.attend === 'no' ? 'no' : '');
    if (!name || !attend) return json_({ ok: false, error: 'invalid' });

    var companions = 0;
    var meal = '';
    if (attend === 'yes') {
      companions = Math.max(0, Math.min(20, parseInt(data.companions, 10) || 0));
      meal = data.meal === 'no' ? '안 함' : '식사';
    }
    var clientId = clean_(data.clientId, 64);

    var sheet = getSheet_();
    var row = [
      Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
      name,
      attend === 'yes' ? '참석' : '불참',
      attend === 'yes' ? companions : '',
      meal,
      clientId,
    ];

    // 같은 기기에서 다시 제출하면(내용 수정) 새 줄을 만들지 않고 기존 줄을 덮어씁니다.
    var existing = clientId ? findRowByClient_(sheet, clientId) : 0;
    if (existing > 0) sheet.getRange(existing, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

// 웹 앱 주소를 브라우저로 열었을 때 보이는 확인용 화면입니다. (응답 내용은 절대 보여주지 않아요)
function doGet() {
  return json_({ ok: true, message: 'RSVP endpoint is running' });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRowByClient_(sheet, clientId) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, HEADERS.length, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === clientId) return i + 2;
  }
  return 0;
}

// 스프레드시트 수식 주입 방지: 글자가 = + - @ 로 시작하면 앞에 ' 를 붙여 일반 글자로 저장
function clean_(value, maxLen) {
  var s = String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, maxLen);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
