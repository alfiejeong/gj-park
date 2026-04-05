// [보존] 전역 변수 유지
var mainMap = null, reportMarker = null, selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzZbCGEoqgC_2MQG7DTvGFgVNL8zcTOX3uJjR1xGTwYBV39yMi8iYlGohnNcNmALV3C/exec";

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
        console.log("통합 데이터 수신 시작 (중계 서버 모드)...");

        // [핵심] 이제 구글 서버가 서울시 데이터를 대신 받아와서 우리에게 한꺼번에 줍니다.
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const data = await response.json();

        if (data && data.length > 0) {
            fetchedData = data;
            console.log("전체 데이터(시트+서울시) 통합 수신 성공:", fetchedData.length, "건");
            
            // 캐시 갱신 (모바일 0초 로딩용)
            localStorage.setItem('gj-cache', JSON.stringify(fetchedData));
            
            if (mainMap) 마커표시실행();
        }
    } catch (e) { 
        console.error("통합 로딩 실패:", e); 
        // 네트워크 장애 시 기존 캐시라도 활용
        const cached = localStorage.getItem('gj-cache');
        if (cached) {
            fetchedData = JSON.parse(cached);
            if (mainMap) 마커표시실행();
        }
    }
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
  // 구글 서버는 외부망 연결이 자유로우므로 http 포트 호출도 문제없습니다.
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