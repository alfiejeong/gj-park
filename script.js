// [보존] 전역 변수 유지
var mainMap = null, reportMarker = null, selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz0Jgj1bWr4p90S_y6f5FGXkg8-rQtg42IQQQOBHrEl2x2XoddU-kOcVf0HQb-9Z-i-/exec";

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
    console.log("데이터 각개전투 취재 개시...");
    
    // [독립 호출 1] 구글 시트 제보 데이터 (13건 등)
    구글시트데이터취재();

    // [독립 호출 2] 서울시 공공데이터 (무료 주차장)
    서울시데이터취재();
}

async function 구글시트데이터취재() {
    try {
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const data = await response.json();
        console.log("✅ 구글 시트 제보 수신 완료:", data.length, "건");
        
        if (data && data.length > 0) {
            data.forEach(item => 마커생성실행(item, "제보"));
        }
    } catch (e) {
        console.error("❌ 구글 시트 통신망 장애:", e);
    }
}

async function 서울시데이터취재() {
    try {
        console.log("서울시 특파원 파견 중...");
        
        // [수정] 파라미터 전달 방식을 더 명확하게 변경
        const targetUrl = `${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`;
        
        const response = await fetch(targetUrl);
        const data = await response.json();

        if (data && data.length > 0) {
            // [검증] 수신된 첫 번째 데이터의 이름을 확인하여 '진짜 서울시 데이터'인지 판별
            console.log("✅ 서울시 수신 데이터 첫 항목:", data[0].name);
            console.log("✅ 서울시 데이터 우회 수신 성공:", data.length, "건");
            
            data.forEach(item => {
                if(item.lat > 0) 마커생성실행(item, "서울시");
            });
        }
    } catch (e) {
        console.error("❌ 서울시 우회 호출 실패:", e);
    }
}

// [공통 마커 생성기] 데이터 소스에 관계없이 지도로 보냅니다.
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
  // [보정] 파라미터 존재 여부를 더 확실하게 체크합니다.
  var type = (e && e.parameter && e.parameter.type) ? e.parameter.type : "sheet";
  
  // 1. 서울시 데이터 요청 모드 (type=seoul)
  if (type === "seoul") {
    var seoulKey = "7353726f51616c663130305873426c73";
    var apiURL = "http://openapi.seoul.go.kr:8088/" + seoulKey + "/json/GetParkInfo/1/1000/";
    
    try {
      var response = UrlFetchApp.fetch(apiURL, { "muteHttpExceptions": true });
      var json = JSON.parse(response.getContentText());
      var seoulData = [];
      
      if (json.GetParkInfo && json.GetParkInfo.row) {
        json.GetParkInfo.row.forEach(function(item) {
          // 무료 필터링
          var isFree = (item.CHGD_FREE_NM === "무료" || item.SAT_CHGD_FREE_NM === "무료" || item.LHLDY_NM === "무료");
          var hasCoords = item.LAT && item.LOT && parseFloat(item.LAT) > 30;

          if (isFree && hasCoords) {
            seoulData.push({
              name: item.PKLT_NM,
              address: item.ADDR,
              lat: parseFloat(item.LAT),
              lng: parseFloat(item.LOT),
              type: item.CHGD_FREE_NM === "무료" ? "상시 무료" : "주말 무료",
              capacity: item.TPKCT || 0,
              note: "평일 운영: " + item.WD_OPER_BGNG_TM + "~" + item.WD_OPER_END_TM,
              user: "서울시"
            });
          }
        });
      }
      return createJsonResponse(seoulData);
    } catch (err) {
      return createJsonResponse([{name: "API에러", lat: 0, lng: 0}]); // 에러 추적용
    }
  } 
  
  // 2. 구글 시트 데이터 요청 모드 (기본값)
  else {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var rows = sheet.getDataRange().getValues();
    var sheetData = [];
    for (var i = 1; i < rows.length; i++) {
      if(!rows[i][2]) continue; // 이름 없으면 패스
      sheetData.push({
        user: rows[i][0], address: rows[i][1], name: rows[i][2],
        type: rows[i][3], capacity: rows[i][4], note: rows[i][5],
        lat: parseFloat(rows[i][6]), lng: parseFloat(rows[i][7])
      });
    }
    return createJsonResponse(sheetData);
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}