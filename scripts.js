/* 
 * BLABLABRA core JS code.
 * 
 * This code is free to use and derive code from, under the terms of the Apache License 2.0.
 * 
 */

// Globals and parameters
var maxSearches = 50;   // It does this much searches...
var pagesPerSearch = 1; // ...that retrieve this much pages of search results...
var pageSize = 100;     // ...containing this much tweets (max is 100).
var wordListSize = 30;  // The resulting word cloud is capped at this much words.
var isListening = false; 

// Courtesy of Google Maps API
var map, geocoder; 
var radarCircleAnim, radarCircleInterval, radarCircleRadius;

// Gentlemen, start your engines.
function initialize() {
    var mapOptions = {
          center: { lat: 43.739401, lng: -79.421399},
          zoom: 9,
          zoomControlOptions: {
            position: google.maps.ControlPosition.LEFT_BOTTOM
          },
          panControl: false,
          scaleControl: true,
          streetViewControl: false
        };
    map = new google.maps.Map(document.getElementById('mapArea'),
            mapOptions);
    geocoder = new google.maps.Geocoder();
            
    // Try HTML5 geolocation
    if(navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(position) {
        var pos = new google.maps.LatLng(position.coords.latitude,
                                         position.coords.longitude);
        map.setCenter(pos);
      }, function() {});
    }
}

// Map search function
function codeAddress() {
    document.getElementById('geocodeMsg').innerHTML = "";
    var address = document.getElementById('address').value;
    geocoder.geocode( { 'address': address}, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
            map.setCenter(results[0].geometry.location);
        } else {
            if (status == 'ZERO_RESULTS')
                document.getElementById('geocodeMsg').innerHTML = "No results.";
            else document.getElementById('geocodeMsg').innerHTML = 'Error: ' + status;
        }
    });
}

// Radar bleep animation
function radarOverlay(turnOn, radius){
    if (turnOn){
        var circleAnimParams = {
            strokeColor: '#00CC00',
            strokeOpacity: 1,
            fillOpacity: 0,
            map: map,
            center: map.getCenter(),
            radius: 1
        };
        radarCircleAnim = new google.maps.Circle(circleAnimParams);
        radarCircleAnimRadius = radius * 1000;
        
        radarCircleInterval = window.setInterval(function(){
            var curRadius = radarCircleAnim.getRadius();
            curRadius += Math.round(radarCircleAnimRadius / 20);
            if (curRadius > radarCircleAnimRadius) curRadius = 1;
            radarCircleAnim.setRadius(curRadius);
            radarCircleAnim.setOptions({
                strokeOpacity: 1 - (curRadius / radarCircleAnimRadius)
            });
        },50);
        
    } else {
        radarCircleAnim.setVisible(false);
        window.clearInterval(radarCircleInterval);
    }
}

// Toggle AJAX calls on/off
function btnStartStopClick(){
    if (!isListening){
        document.getElementById("errorMsg").innerHTML = "";
        document.getElementById("status").innerHTML = "Starting search, please wait...";
        isListening = true;
        document.getElementById("btnStartStop").className = "btnOn";
        document.getElementById("btnStartStop").value = "Stop";
        startListening();
    } else {
        document.getElementById("status").innerHTML = "Stopping...";
        isListening = false;
        document.getElementById("btnStartStop").className = "btnOff";
        document.getElementById("btnStartStop").value = "Start";
    }
}

// Auxiliary functions:

// Generate a valid CSS class name for each word, so they can be found/animated later.
function wordToCssId(word, type){
    
    switch (type){
        case "hashtags": 
            return "_HS_" + word.substr(1).replace(/\W/g,"_").toLowerCase();
            break;
        case "expressions":
            return "_XP_" + word.replace(/\W/g,"_").toLowerCase();
            break;
        case "UCwords":
            return "_UC_" + word.replace(/\W/g,"_").toLowerCase();
            break;
        case "LCwords":
            return "_LC_" + word.replace(/\W/g,"_").toLowerCase();
            break;
    }
}

// Translate a word count in a font size (to grow/shrink words in the word list)
function countToFontSize(count, min, max){
    var baseSize = 1;  // Basic (non-enlarged) font size. All values in em.
    var maxSize = 3;
    
    countRatio = (count - min) / (max - min);
    sizeRange = maxSize - baseSize;
    return Math.round(sizeRange * countRatio) + baseSize;
}

// This is used to sort arrays
function reverse(a, b) {
    return b - a;
}

// Now for the meaty parts:

function startListening() {
    var searchCount = 0;
    var tweetCount = 0;
    // All the magic ends up in TTopics,
    // a multidimensional array with types and words and their ocurrence amounts
    // 
    // ["hashtags"]
    //      ["#yolo"] => 12
    //      ["#tgif"] => 99
    //  ["expressions"]
    //      ["Bloody Mary"] => 12
    //  ["UCwords"] (meaning 'uppercase words')
    //      ["Patriots"] => 12
    //      ["Dolphins"] => 8
    //  etc.
    var TTopics = []; 
    
    // This will store the range of count amounts that will be displayed.
    // Limited to 'wordListSize' elements.
    var countAmounts;
    
    // Where are you pointing at, Google Maps?
    var map_lat = map.getCenter().lat();
    var map_lng = map.getCenter().lng();
    
    // Range radius is measured from the center to the top of the map.
    var map_range = Math.round(google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(map.getBounds().getNorthEast().lat(), map_lng),
                new google.maps.LatLng(map_lat, map_lng)) / 1000);
                
    radarOverlay(true, map_range);
    
    var proxyUrl = "TTbyLocation.php"
        +"?lat="+map_lat.toString()
        +"&long="+map_lng.toString()
        +"&radius="+map_range.toString()
        +"&pages="+pagesPerSearch
        +"&page_size="+pageSize;

    // Getting ready to dive into the intarweb tubes
    var xmlhttp;
    if (window.XMLHttpRequest){
            xmlhttp=new XMLHttpRequest(); // code for IE7+, Firefox, Chrome, Opera, Safari
    } else if (window.ActiveXObject){
            xmlhttp=new ActiveXObject("Microsoft.XMLHTTP"); // code for IE6, IE5
    } else {
            alert("What browser is this that doesn't support AJAX!?");
    }
    
    // Ensure my list of results is there and cleared
    wordList = document.getElementById("wordlist");
    if (wordList === null){
        document.getElementById("bottomHalf").innerHTML = 
                "<div id='results'>"
                + "<h2>Results:</h2>"
                + "<ul id='wordlist'></ul>"
                + "</div>";
        wordList = document.getElementById("wordlist");
    } else {
        wordList.innerHTML = "";
    }

    // When the tubes start pouring, you go and do THIS:
    xmlhttp.onreadystatechange=function(){
        if (xmlhttp.readyState == 4){
            searchCount++;
            var JSONresults = eval('(' + xmlhttp.responseText + ')');
            
            if (!("errors" in JSONresults)){
                // Count stuff out
                tweetCount += JSONresults["METADATA"]["tweets"];
                var types = ["hashtags", "expressions", "UCwords"];
                var type;

                // The word list moves around the speed of the AJAX calls, 
                // to ensure smoothness.
                animSpeed = Math.round(JSONresults["METADATA"]["time_elapsed"] * 1000);

    //            console.log("Input JSON:");
    //            console.log(JSONresults["METADATA"]);
    //            console.log("Initial TTopics status");
    //            console.log(TTopics);

                // Update the counts in TTopics
                for (var i=0; i<types.length; i++){
                    type = types[i];
                    if (!(type in TTopics)){
                        TTopics[type] = new Array();
                    }
                    for (var word in JSONresults[type]){
                        if (TTopics[type][word] >= 1){
                                TTopics[type][word] = TTopics[type][word] + JSONresults[type][word];
                        } else { 
                                TTopics[type][word] = JSONresults[type][word];
                        }
                    }
                }

                // Generate the count amounts array
                countAmounts = [];
                for (var i=0; i<types.length; i++){
                    type = types[i];
                    for (var word in TTopics[type]){
    //                    console.log("ARRAY: Processed '"+word+"' (count="+TTopics[type][word]+")");
                        if (countAmounts.indexOf(TTopics[type][word]) === -1){
                            countAmounts.push(TTopics[type][word]);
                            countAmounts.sort(reverse);
    //                        console.log("ARRAY: "+countAmounts.toString());
                            if(countAmounts.length > wordListSize){
                                countAmounts.pop();
                            }
                        }
                    }
                }

    //            console.log("Final array: "+countAmounts.toString());
    //            console.log("Starting list update.");

                var shownWords = 0;
                var minAmount = countAmounts[countAmounts.length-1];

                /*  Update the word cloud
                 * 
                 *  Now, this is tricky: the 'for' loops traverse TTopics in a 
                 *  counterintuitive way. The outermost 'for' loop is used to 
                 *  process the words from the most popular to the least, 
                 *  starting with the largest word count in countAmount.
                 *  
                 *  As words of different types might have the same word count, 
                 *  shownWords is used to keep a hard limit on how many words are 
                 *  visible on the page.
                 *  
                 *  The inner loops traverse TTopics in order by word type. 
                 *  This ensures priority for hashtags first, then expressions, 
                 *  etc., in the case multiple words have the same word count. 
                 *  Notice the last type (lowercase words) is done only if there 
                 *  is space left.
                 *  
                 *  It's convoluted, but saves some costly array traversals.
                */
                for(i=0; i<countAmounts.length; i++){
                    if ((shownWords >= wordListSize) || (countAmounts[i] == 1)){
                        minAmount = countAmounts[i];
                        break;
                    }
                    for(typeKey=0; typeKey < types.length; typeKey++){
                        if (shownWords >= wordListSize) break;
                        currentType = types[typeKey];
    //                    console.log(" ==== Current type:"+currentType+" ==== already inserted: "+shownWords);
                        for (word in TTopics[currentType]) {
                            if (shownWords >= wordListSize) break;
                            listItem = document.getElementById(wordToCssId(word, currentType));
                            // A word is popular if its count amount is in countAmounts.
                            if (TTopics[currentType][word] == countAmounts[i]){
                                idName = wordToCssId(word, currentType);
                                if (listItem === null){
                                    // New popular word. Welcome to the page!
                                    listItem = document.createElement("li");
                                    listItem.id = idName;
                                    listItem.className = currentType;
                                    listItem.style = "display: none;";
                                    listItem.innerHTML = "<a href='https://twitter.com/search?q=" + encodeURIComponent(word) + "' target='_blank' "
                                            + "title='" + TTopics[currentType][word] + " occurrences'>"
                                            + word 
                                            + "</a>";
                                    wordList.insertBefore(listItem, wordList.lastChild);
                                    $("#"+idName).show(animSpeed);
    //                                console.log(word+" inserted. Count:"+TTopics[currentType][word]);
                                    shownWords++;
                                } else {
                                    // Word already on the page, update it.
                                    listItem.firstChild.title = TTopics[currentType][word] + " occurrences";
                                    if (!$("#"+idName).is(":visible")){
                                        $("#"+idName).show(animSpeed);
    //                                    console.log(word+" re-shown. Count:"+TTopics[currentType][word]);
                                    }
                                    // Grow/shrink the word according to the word count
                                    animProperties = {};
                                    animProperties["font-size"] = countToFontSize(TTopics[currentType][word],countAmounts[countAmounts.length-1],countAmounts[0]) + "em";
                                    $("#"+idName).animate(animProperties,animSpeed);
                                    shownWords++;
                                }    
                            }
                        }
                    }
                }

    //            console.log(" = = = = = = = = = = = = = = = = = = = = = ");
    //            console.log(" D O N E - Min amount is " + minAmount);
    //            console.log(" = = = = = = = = = = = = = = = = = = = = = ");

                // Now, remove un-popular words that might be on display
                if ((minAmount != countAmounts[countAmounts.length-1]) ||
                    (minAmount == 1)){
                    for(typeKey=0; typeKey < types.length; typeKey++){
                        currentType = types[typeKey];
    //                    console.log(" ==== Deleting type:"+currentType+" ==== ");
                        for (word in TTopics[currentType]) {
                            if (TTopics[currentType][word] <= minAmount){
                                idName = wordToCssId(word, currentType);
                                listItem = document.getElementById(idName);
                                if (listItem !== null){
                                    if ($("#"+idName).is(":visible")){
                                        $("#"+idName).hide(animSpeed);
    //                                    console.log(word+" hidden. Count:"+TTopics[currentType][word]);
                                    }
                                }
                            }
                        }
                    }
                }
    //            console.log(" = = = = = = = = = = = = = = = = = = = = = ");

                if ((searchCount < maxSearches) && isListening){
                    // I'm still hungry, give me MORE DATA!
                    document.getElementById("status").innerHTML = tweetCount + " tweets processed so far. Fetching more data...";
                    //document.getElementById("status").innerHTML += "<br />" + proxyUrl + "&max_id=" + JSONresults.METADATA.min_id;
                    xmlhttp.open("GET", proxyUrl + "&max_id=" + JSONresults.METADATA.min_id, true);
                    xmlhttp.send(null);
                } else {
                    // I had enough.
                    document.getElementById("status").innerHTML = "Done! Counted " + tweetCount + " tweets.";
                    searchCount = 0;
                    tweetCount = 0;
                    radarOverlay(false, map_range);
                    isListening = false;
                    TTopics = null; // Release some memory
                    document.getElementById("btnStartStop").className = "btnOff";
                    document.getElementById("btnStartStop").value = "Start";
                }
            } else {
                // My tummy does not feel too good :(
                radarOverlay(false, map_range);
                isListening = false;
                var errorMsg;
                console.log("Error code " + JSONresults["errors"][0]["code"]);
                switch (JSONresults["errors"][0]["code"]){
                    case 88:
                        errorMsg = "Sorry, the Twitter API usage limit was exceeded. Try again in a few minutes.";
                        break;
                    default:
                        errorMsg = JSONresults["errors"][0]["message"];
                }
                document.getElementById("errorMsg").innerHTML = errorMsg;
            }
        }
    };

    // The AJAX call that starts it all
    xmlhttp.open("GET", proxyUrl, true);
    xmlhttp.send(null);
}