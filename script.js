// [보존] 전역 변수 유지
var mainMap = null, reportMarker = null, selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxDEMtukJ1fS9A8PTSP1OJ8TDJApnKqZCL66mnb4JUlndrQ8S0R481QeYnEaalh8jd8/exec";

// [신규 추가] 서울시 API 인증키
const SEOUL_API_KEY = "7353726f51616c663130305873426c73";

window.onload = function() {
    // 1. 데이터 선제 로드 (캐시)
    const cachedData = localStorage.getItem('gj-cache');
    if (cachedData) { fetchedData = JSON.parse(cachedData); }

    // 2. 백그라운드 데이터 호출
    데이터불러오기();

    // 3. 지도 초기 생성 (서울 시청 기본값)
    var defaultCenter = new naver.maps.LatLng(37.5665, 126.9780); 
    mainMap = new naver.maps.Map('map', {
        center: defaultCenter,
        zoom: 16,
        logoControl: false
    });

    // 4. [보완] 지도가 뜨자마자 즉시 제보 마커를 화면 중앙에 생성 (0초 노출)
    생성제보마커(defaultCenter);

    // 5. 캐시 마커 표시
    if (fetchedData) 마커표시실행();

    // 6. 내 위치 찾기 및 마커 이동
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var myLoc = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            if(mainMap) {
                mainMap.setCenter(myLoc);
                if (reportMarker) reportMarker.setPosition(myLoc); // 내 위치로 핀 이동
                selectedCoord = myLoc;
            }
        });
    }

    // 닉네임 로드
    const savedNick = localStorage.getItem('gj-nick');
    if(savedNick) document.getElementById('user-nick').value = savedNick;

    // 7. [로직 수정] 지도 클릭 시: "정보창 닫기" 및 "핀 이동"만 수행 (입력창 열지 않음)
    naver.maps.Event.addListener(mainMap, 'click', function(e) {
        if (currentInfoWindow) {
            currentInfoWindow.close();
            currentInfoWindow = null;
        }
        
        // 클릭한 곳으로 제보 핀 이동
        selectedCoord = e.coord;
        if (reportMarker) {
            reportMarker.setPosition(selectedCoord);
        } else {
            생성제보마커(selectedCoord);
        }
    });
};

// [신규/보강] 블랙&옐로우 역물방울 마커 생성 함수
function 생성제보마커(coord) {
    if (reportMarker) reportMarker.setMap(null);
    selectedCoord = coord;
    reportMarker = new naver.maps.Marker({
        position: coord,
        map: mainMap,
        icon: { 
            // CSS에서 정의한 gj-pin 클래스 사용 (블랙 테두리, 노랑 속, 역물방울)
            content: '<div class="gj-pin"></div>', 
            anchor: new naver.maps.Point(17, 35) 
        }
    });
}

// [보존] 내위치찾기 함수
function 내위치찾기() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            const curr = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            mainMap.setCenter(curr);
            mainMap.setZoom(17);
            if (reportMarker) reportMarker.setPosition(curr);
            selectedCoord = curr;
        });
    }
}

// [로직 수정] 명당 제보 버튼 클릭 시: 그제서야 주소를 찾고 입력창을 띄움
function 제보하기() {
    if (!selectedCoord) {
        alert("지도를 클릭하여 제보 위치를 먼저 선택해주세요.");
        return;
    }

    // 현재 마커가 찍힌 위치의 주소를 가져옴
    naver.maps.Service.reverseGeocode({ coords: selectedCoord }, function(status, response) {
        if (status === naver.maps.Service.Status.OK) {
            const finalAddr = response.v2.address.jibunAddress || response.v2.address.roadAddress;
            document.getElementById('place-addr').value = finalAddr || "";
            
            // 버튼을 눌렀을 때만 모달창 노출
            document.getElementById('report-modal').style.display = 'block';
            document.getElementById('modal-overlay').style.display = 'block';
        } else {
            alert("주소를 확인할 수 없는 지역입니다. 다시 시도해 주세요.");
        }
    });
}

async function 데이터불러오기() {
    try {
        console.log("데이터 수급 라인 전면 복구 시작...");
    console.log("데이터 개별 취재 공정 개시...");
    
    // 1. [독립 실행] 구글 시트 데이터 로드 및 표시
    구글시트데이터로드();

        // 1. 구글 시트 제보 데이터 가져오기
        const sheetRes = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const sheetData = await sheetRes.json();
        console.log("구글 시트 데이터 로드 완료:", sheetData.length, "건");
    // 2. [독립 실행] 서울시 API 데이터 로드 및 표시
    서울시데이터로드();
}

        // 2. 서울시 API 직접 호출 (보안 규격 최적화 주소)
        // 모바일 차단을 방지하기 위해 https와 443 표준 포트 규격을 사용합니다.
        const apiURL = `https://openapi.seoul.go.kr/${SEOUL_API_KEY}/json/GetParkInfo/1/1000/`;
async function 구글시트데이터로드() {
    try {
        const res = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const data = await res.json();
        console.log("✅ 구글 시트 제보 수신:", data.length, "건");
        
        let apiData = [];
        try {
            const apiRes = await fetch(apiURL);
            const apiRaw = await apiRes.json();
        if (data && data.length > 0) {
            data.forEach(item => 마커생성실행(item, "제보"));
        }
    } catch (e) { console.error("❌ 구글 시트 로드 실패:", e); }
}

async function 서울시데이터로드() {
    try {
        // 보안 오류를 피하기 위해 포트 번호를 제거한 표준 HTTPS 경로 사용
        const apiURL = `https://openapi.seoul.go.kr/${SEOUL_API_KEY}/json/GetParkInfo/1/1000/`;
        const res = await fetch(apiURL);
        const json = await res.json();

        if (json && json.GetParkInfo && json.GetParkInfo.row) {
            const rows = json.GetParkInfo.row;
            let count = 0;
            
            if (apiRaw && apiRaw.GetParkInfo && apiRaw.GetParkInfo.row) {
                apiData = apiRaw.GetParkInfo.row
                    .filter(item => {
                        // 무료 조건: 유무료구분이 '무료'이거나 주말/공휴일이 '무료'인 경우
                        const isFree = item.CHGD_FREE_NM === "무료" || 
                                       item.SAT_CHGD_FREE_NM === "무료" || 
                                       item.LHLDY_NM === "무료";
                        // 좌표 유효성: 위도(LAT)가 정상 범위(서울 37도 부근)인 경우만
                        const hasCoords = item.LAT && item.LOT && parseFloat(item.LAT) > 30;
                        return isFree && hasCoords;
                    })
                    .map(item => ({
            rows.forEach(item => {
                // 무료 조건 및 좌표 유효성 검사
                const isFree = item.CHGD_FREE_NM === "무료" || item.SAT_CHGD_FREE_NM === "무료" || item.LHLDY_NM === "무료";
                const hasCoords = item.LAT && item.LOT && parseFloat(item.LAT) > 30;

                if (isFree && hasCoords) {
                    const mappedItem = {
                        name: item.PKLT_NM,
                        address: item.ADDR,
                        lat: parseFloat(item.LAT),
                        lng: parseFloat(item.LOT),
                        type: item.CHGD_FREE_NM === "무료" ? "상시 무료" : "조건부 무료",
                        type: item.CHGD_FREE_NM === "무료" ? "상시 무료" : "주말 무료",
                        capacity: item.TPKCT || 0,
                        note: `평일: ${item.WD_OPER_BGNG_TM}~${item.WD_OPER_END_TM} / 토·공휴일: ${item.SAT_CHGD_FREE_NM}/${item.LHLDY_NM}`,
                        note: `평일: ${item.WD_OPER_BGNG_TM}~${item.WD_OPER_END_TM}`,
                        user: "서울시"
                    }));
                console.log("서울시 데이터 발굴 성공:", apiData.length, "건");
            }
        } catch (apiErr) {
            console.error("서울시 API 호출 실패 (네트워크/보안):", apiErr);
                    };
                    마커생성실행(mappedItem, "서울시");
                    count++;
                }
            });
            console.log("✅ 서울시 무료 명당 발굴:", count, "건");
        }
    } catch (e) { 
        console.error("❌ 서울시 API 접근 불가 (보안/네트워크):", e); 
        console.log("💡 팁: 크롬 주소창 옆 '안전하지 않은 콘텐츠 허용' 설정을 확인하십시오.");
    }
}

        // 3. 데이터 병합 및 지도 현시
        fetchedData = [...sheetData, ...apiData];
        localStorage.setItem('gj-cache', JSON.stringify(fetchedData));
        
        if (mainMap) {
            마커표시실행();
            console.log("전체 마커 지도 배치 명령 완료");
// [핵심] 공통 마커 생성 함수 (중복 로직 제거)
function 마커생성실행(item, source) {
    if (!mainMap || !item.lat || !item.lng) return;

    const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(item.lat, item.lng),
        map: mainMap,
        icon: {
            content: `<div class="parking-label ${source === '서울시' ? 'seoul-style' : ''}">${item.type}</div>`,
            anchor: new naver.maps.Point(20, 10)
        }
    });

    } catch (e) { 
        console.error("통합 로딩 중 치명적 오류:", e); 
    }
    const infoWindow = new naver.maps.InfoWindow({
        content: `<div style="padding:15px; min-width:200px; line-height:1.5; background:#fff; border:3px solid #FFD400; border-radius:12px;">
            <h4 style="margin:0; color:#FF5252;">📍 ${item.name}</h4>
            <div style="font-size:12px; color:#666;">${item.address}</div>
            <div style="font-size:13px; margin-top:5px;"><b>유형:</b> ${item.type} (${item.capacity}면)</div>
            <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px;">${item.note}</div>
            <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">출처: ${item.user}</div>
        </div>`,
        borderWidth: 0, disableAnchor: true, pixelOffset: new naver.maps.Point(0, -10)
    });

    naver.maps.Event.addListener(marker, "click", function() {
        if (currentInfoWindow) currentInfoWindow.close();
        infoWindow.open(mainMap, marker);
        currentInfoWindow = infoWindow;
    });
}

// 나머지 마커표시실행, 제보하기 등 함수는 기존 최적화 코드 유지

function 마커표시실행() {
    if (!fetchedData || !mainMap) return;
    fetchedData.forEach(item => {
        const marker = new naver.maps.Marker({
            position: new naver.maps.LatLng(item.lat, item.lng), 
            map: mainMap,
            icon: { content: `<div class="parking-label">${item.type}</div>`, anchor: new naver.maps.Point(20, 10) }
        });
        const infoWindow = new naver.maps.InfoWindow({
            content: `<div style="padding:15px; min-width:200px; line-height:1.5; background-color: #fff; border: 3px solid #FFD400; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <h4 style="margin:0; color:#FF5252; font-size:16px;">📍 ${item.name || '무명'}</h4>
                <div style="font-size:12px; color:#666; margin-bottom:5px;">${item.address || '주소 불명'}</div>
                <div style="font-size:13px; margin-top:5px; color:#333;"><b>유형:</b> ${item.type} (${item.capacity || 0}면)</div>
                <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px; color:#555; border-left:3px solid #FFD400;">${item.note || '꿀팁 준비 중'}</div>
                <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">제보자: ${item.user || '익명'}</div>
            </div>`,
            borderWidth: 0, disableAnchor: true, pixelOffset: new naver.maps.Point(0, -10)
        });
        naver.maps.Event.addListener(marker, "click", function() {
            if (currentInfoWindow) currentInfoWindow.close();
            infoWindow.open(mainMap, marker);
            currentInfoWindow = infoWindow;
        });
    });
}

function 닫기제보창() {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
}

async function 저장제보() {
    const user = document.getElementById('user-nick').value;
    const addr = document.getElementById('place-addr').value;
    const name = document.getElementById('place-name').value;
    const type = document.getElementById('parking-type').value;
    const cap = document.getElementById('parking-cap').value;
    const note = document.getElementById('place-note').value;
    if (!user || !name || !type) { alert("필수 정보를 입력하세요!"); return; }
    localStorage.setItem('gj-nick', user);
    const payload = { user: user, address: addr, name: name, type: type, capacity: cap, note: note, lat: selectedCoord.lat(), lng: selectedCoord.lng() };
    try {
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload), mode: 'no-cors' });
        localStorage.removeItem('gj-cache');
        alert("제보 성공!"); location.reload();
    } catch (e) { alert("전송 실패"); }
}

function doGet(e) {
  // 1. 내 구글 시트 데이터 (제보 내역) 가져오기
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  var combinedData = [];
  
  for (var i = 1; i < rows.length; i++) {
    combinedData.push({
      user: rows[i][0], address: rows[i][1], name: rows[i][2],
      type: rows[i][3], capacity: rows[i][4], note: rows[i][5],
      lat: parseFloat(rows[i][6]), lng: parseFloat(rows[i][7])
    });
  }

  // 2. [핵심] 구글 서버가 서울시 API를 직접 호출 (보안 차단 없음)
  var seoulApiKey = "7353726f51616c663130305873426c73";
  // 구글 서버는 외부망 연결이 자유로우므로 http 호출도 문제없습니다.
  var apiURL = "http://openapi.seoul.go.kr:8088/" + seoulApiKey + "/json/GetParkInfo/1/1000/";
  
  try {
    var response = UrlFetchApp.fetch(apiURL);
    var json = JSON.parse(response.getContentText());
    
    if (json.GetParkInfo && json.GetParkInfo.row) {
      json.GetParkInfo.row.forEach(function(item) {
        // [필터링] 무료 주차장만 골라내기 (명세서 기반)
        var isFree = (item.CHGD_FREE_NM === "무료" || item.SAT_CHGD_FREE_NM === "무료" || item.LHLDY_NM === "무료");
        var hasCoords = item.LAT && item.LOT && parseFloat(item.LAT) > 30;

        if (isFree && hasCoords) {
          combinedData.push({
            name: item.PKLT_NM,
            address: item.ADDR,
            lat: parseFloat(item.LAT),
            lng: parseFloat(item.LOT),
            type: item.CHGD_FREE_NM === "무료" ? "상시 무료" : "주말 무료",
            capacity: item.TPKCT || 0,
            note: "평일: " + item.WD_OPER_BGNG_TM + "~" + item.WD_OPER_END_TM + " / 서울 공공데이터",
            user: "서울시"
          });
        }
      });
    }
  } catch (err) {
    // API 장애 시 제보 데이터만이라도 전송
  }

  // 3. 통합된 데이터를 JSON으로 반환
  return ContentService.createTextOutput(JSON.stringify(combinedData))
    .setMimeType(ContentService.MimeType.JSON);
}