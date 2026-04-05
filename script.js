// [보존] 전역 변수 유지
var mainMap = null, reportMarker = null, selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbytKkWpWDrqEebLCdxmcSqeSMZYT4YVd7jtzyMAGr02Kwebqj6j2jxXMOUhfIFOmaAH/exec";

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
        console.log("서울시 최신 규격 데이터 취재 시작...");

        // 1. 구글 시트 제보 데이터 호출 (기존 유지)
        const sheetRes = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const sheetData = await sheetRes.json();

        // 2. 서울시 API 호출 (명세서 규격 적용)
        const apiURL = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/GetParkInfo/1/1000/`;
        
        let apiData = [];
        try {
            const apiRes = await fetch(apiURL);
            const apiRaw = await apiRes.json();
            
            if (apiRaw && apiRaw.GetParkInfo && apiRaw.GetParkInfo.row) {
                apiData = apiRaw.GetParkInfo.row
                    .filter(item => {
                        // [무료 판별 로직] 유무료구분명(CHGD_FREE_NM)이 '무료'이거나, 
                        // 토요일/공휴일 무료(SAT_CHGD_FREE_NM, LHLDY_NM)인 경우 포함
                        const isAlwaysFree = item.CHGD_FREE_NM === "무료";
                        const isWeekendFree = item.SAT_CHGD_FREE_NM === "무료" || item.LHLDY_NM === "무료";
                        const isNightFree = item.NGHT_FREE_OPN_YN_NAME === "야간 개방";
                        
                        // 좌표(LAT, LOT)가 반드시 있어야 지도에 찍을 수 있음
                        const hasCoords = item.LAT && item.LOT && parseFloat(item.LAT) > 0;

                        return (isAlwaysFree || isWeekendFree || isNightFree) && hasCoords;
                    })
                    .map(item => ({
                        name: item.PKLT_NM, // 주차장명
                        address: item.ADDR, // 주소
                        lat: parseFloat(item.LAT),
                        lng: parseFloat(item.LOT),
                        // 상태에 따른 유형 매핑
                        type: item.CHGD_FREE_NM === "무료" ? "상시 무료" : "조건부 무료",
                        capacity: item.TPKCT || 0, // 총 주차면
                        note: `평일: ${item.WD_OPER_BGNG_TM}~${item.WD_OPER_END_TM} / 토요일: ${item.SAT_CHGD_FREE_NM} / 공휴일: ${item.LHLDY_NM}`,
                        user: "서울시"
                    }));
                
                console.log(`서울시 명당 발굴 성공: ${apiData.length}건 (무료 및 좌표 확보 기준)`);
            }
        } catch (apiErr) {
            console.warn("서울시 API 응답 분석 중 오류:", apiErr);
        }

        // 3. 데이터 병합 및 캐시
        fetchedData = [...sheetData, ...apiData];
        localStorage.setItem('gj-cache', JSON.stringify(fetchedData));
        
        if (mainMap) 마커표시실행();
        console.log("거지주차.com 서울시 데이터 이식 완료");

    } catch (e) { console.error("데이터 통합 프로세스 실패:", e); }
}

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