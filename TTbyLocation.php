<?php
    /* 
    * BLABLABRA server-side code.
    * 
    * This code is free to use and derive code from (as long as the source is disclosed),
    * under the terms of the GNU General Public License v2.0.
    * 
    */
    $start_time = microtime(true);
    // =============
    // API functions
    // =============
    function getAPItoken() {
        if(file_exists("token.ini")){
            return file_get_contents("token.ini");
        } else {
            // Get app credentials
            // The INI file format should contain the api key and secret from Twitter API. 
            // If you're reusing this code you must get those keys and create an INI file
            // containing both.
            $ini = parse_ini_file("blablabra.ini");
            $auth = base64_encode(rawurlencode($ini["api_key"]).':'.rawurlencode($ini["api_secret"]));

            // Setup a header
            $header = array();
            $header[] = "Content-length: 29";
            $header[] = "Content-type: application/x-www-form-urlencoded;charset=UTF-8";
            $header[] = "Authorization:  Basic " . $auth;

            // Setup the API call to get a bearer token
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, "https://api.twitter.com/oauth2/token");
            curl_setopt($ch, CURLOPT_HEADER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $header);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, "grant_type=client_credentials");
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2); // Check if this is really needed
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true); // Check if this is really needed
            curl_setopt($ch, CURLOPT_USERAGENT, "Blablabra v.01 alpha"); // Check if this is really needed
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); // Check if this is really needed
            curl_setopt($ch, CURLOPT_ENCODING, "gzip"); // Check if this is really needed

            $result = curl_exec($ch);

            $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($httpcode == 200){
                // The token is in the JSON that came in the result body
                $JSONdata = json_decode(strrchr($result,"{"), true);
                if(file_put_contents("token.ini",$JSONdata["access_token"]) !== false){
                    return $JSONdata["access_token"];
                } else return "ERROR writing token file.";
            } else {
                return "ERROR ".$httpcode." - ".$result;
            }
        }
    }

    function getAPIresults($url, $bearerKey) {
        // Setup a header
        $header = array();
        $header[] = "Authorization:  Bearer " . $bearerKey;
                
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $header);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2); // Check if this is really needed
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true); // Check if this is really needed
        curl_setopt($ch, CURLOPT_USERAGENT, "Blablabra v.01 alpha"); // Check if this is really needed
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); // Check if this is really needed
        curl_setopt($ch, CURLOPT_ENCODING, "gzip"); // Check if this is really needed
        
        $result = curl_exec($ch);
        $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        // Check for errors and return results
        if ($httpcode == 200){
            return $result;
        } else {
            if ($httpcode == 401){
                // The cached token probably expired. 
                // Delete the token file to force a regeneration,
                // then retry the API call.
                if(file_exists("token.ini"))
                    if (unlink("token.ini")){
                        $bearerKey = getAPItoken();
                        return getAPIresults($url, $bearerKey);
                    } else return '{ "errors": [ { "code": 900, "message": "invalid token, cannot regenerate token file." } ] }';
            } else {
                $errorData = json_decode(strstr($result,"{"), true);
                if ($errorData)
                    return $result;
                else return '{ "errors": [ { "code": '.$httpcode.', "message": "'.$result.'" } ] }';
                
            }
        }
    }
    
    function lowercase_callback($m) {
        return mb_strtolower($m[0],'UTF-8');
    }
    
    // =========    
    // Main code
    // =========

    // Check script parameters
    if (isset($_GET['testmode'])){
        $test_mode = true;
    } else $test_mode = false;
    
    if (!isset($_GET['lat']) || !isset($_GET['long']) || !isset($_GET['radius'])){
            echo 'Missing parameters';
            die;
    }
    $lat = (string)filter_input(INPUT_GET, 'lat', FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION);
    $long = (string)filter_input(INPUT_GET, 'long', FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION);
    $radius = (int)round(filter_input(INPUT_GET, 'radius', FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION));
    
    if (isset($_GET['max_id'])){
        $oldest_id = filter_input(INPUT_GET, 'max_id', FILTER_SANITIZE_NUMBER_INT);
    } else $oldest_id = 0;
    
    // Retrieve this much pages of search results...
    if (isset($_GET['pages'])){
        $max_pages = filter_input(INPUT_GET, 'pages', FILTER_SANITIZE_NUMBER_INT);
    } else $max_pages = 10;
    
    // ...with this many tweets in each page (maximum is 100).
    if (isset($_GET['page_size'])){
        $page_size = filter_input(INPUT_GET, 'page_size', FILTER_SANITIZE_NUMBER_INT);
    } else $page_size = 100;

    if ($radius > 2500){
        $radius = 2500;
    }

    // Special characters used with regex
    // (This won't work in many languages, so a TODO is to refactor this for non-latin alphabets).
    define('UCSPECIAL', 'ÁÂÀÃÉÊÍÑÓÕÔÚÜÇ');
    define('LCSPECIAL', 'áàâãéêíñóõôúüç');

    // This array will store the parsed tweet data.
    $TT = array('usernames' => array(),
                            'URLs' => array(),
                            'expressions' => array(),
                            'hashtags' => array(),
                            'UCwords' => array(),
                            'LCwords' => array());
    $typeslist = array('usernames','URLs','expressions','hashtags','UCwords','LCwords'); // Used to navigate the array above

    $tweets_received = 0;
    $max_timeframe = 30 * (60*60); // Retrieves either the number of tweets specified or half an hour worth of tweets, whichever comes first.
    $initial_time = 0;
    
    // Get API credentials for the queries
    $bearerKey = getAPItoken();
    if (substr($bearerKey,0,5) == "ERROR"){
        echo $bearerKey;
        die;
    }
    
    // Setup the initial query
    $base_url = 'https://api.twitter.com/1.1/search/tweets.json';
    $url = $base_url . '?q=&geocode='.$lat.','.$long.','.$radius.'km&result_type=recent&count='.$page_size;
    if ($oldest_id != 0){
        $url = $url . '&max_id=' . $oldest_id . '&include_entities=1';
    }

    $pages_done = 0;
    // Loop for search pagination
    do {
        // Run it
        $search_api_result = getAPIresults($url, $bearerKey);
        
        // Decode it
        $JSONdata = json_decode(strstr($search_api_result,"{"), true);
        
        if (isset($JSONdata['errors'])){
            header('Content-type: application/json');
            echo strstr($search_api_result,"{");
            die;
        }

        // Parse it
        $tweet_count = 0;
        foreach($JSONdata['statuses'] as $searchitem){
            $tweet = html_entity_decode($searchitem['text']);
            $tweets_received++;

            if ($test_mode){ 
                echo "===========================================<br />";
                echo $tweet . "<br />";
            }

            // Verify execution looping parameters
            if ($oldest_id == 0) $oldest_id = $searchitem['id'];
            else if ($oldest_id > $searchitem['id']) $oldest_id = $searchitem['id'];
            if ($initial_time == 0) $initial_time = strtotime(substr($searchitem['created_at'],5,20));
            $timeframe = $initial_time - strtotime(substr($searchitem['created_at'],5,20));

            // Now for the actual parsing. Brace for lots of regex.
            // First, some tidying up: separate @usernames from @replies...
            $regex_replies = '/^@[\w]+,?\s?(@[\w]+,?\s?)*/ui';
            $aux = array();
            preg_match_all($regex_replies, $tweet, $aux);
            if(count($aux[0]) > 0) {
                preg_match_all('/@[\w]+/ui', $aux[0][0], $topics_replynames);   // They are stored in $topics_replynames...
                $tweet = preg_replace($regex_replies,'',$tweet);                // ... then removed.
            }
            if ($test_mode) echo $tweet . "<br />";

            // Now, remove URLs from the tweet text.
            $URLs = array();
            $regex_URLs = '{http(s?)://(\S)+}u';
            $tweet = preg_replace($regex_URLs,'',$tweet);
            if ($test_mode) echo $tweet . "<br />";

            // Adjust case for words in ALL CAPS
            $regex_shouting = '/([\s-][A-Z0-9'.UCSPECIAL.']+)+(?![@#\w'.LCSPECIAL.'])/u';
            $tweet = preg_replace_callback($regex_shouting, 'lowercase_callback', $tweet);
            if ($test_mode) echo $tweet . "<br />";

            // Uppercase letters after punctuation must be switched to lowercase, so it won't assume they're not proper names.
            $tweet = preg_replace_callback('{(?<=[!:"\'?\.])\s?[A-Z'.UCSPECIAL.'](?=[a-z'.LCSPECIAL.'])}u', 'lowercase_callback', $tweet);
            if ($test_mode) echo $tweet . "<br />";
            
            // The same with the first letter of the tweet text.
            $tweet = trim($tweet);
            $tweet = preg_replace_callback('{^[A-Z'.UCSPECIAL.'](?=[a-z'.LCSPECIAL.'])}u', 'lowercase_callback', $tweet);
            if ($test_mode) echo $tweet . "<br />";

            // Now for some actual parsing. First, proper nouns (like "San Francisco").
            // Those are matched as sequence of uppercase-starting words "connected" by a single space, hyphen or ampersand.
            $regex_proper_nouns ='{(?<![@#\w'.LCSPECIAL.'])[A-Z'.UCSPECIAL.'][-\w\''.LCSPECIAL.UCSPECIAL.']+(([-\s\&])?[A-Z'.UCSPECIAL.'][-\w\''.LCSPECIAL.UCSPECIAL.']+)+}u';
            preg_match_all($regex_proper_nouns, $tweet, $topics_expressions);
            if ($test_mode) echo $tweet . "<br />";
            
            // Multiple word proper nouns are removed from the tweet, to prevent accounting for "Slim Shady", "Slim" and "Shady".
            $tweet = preg_replace($regex_proper_nouns,'',$tweet);
            if ($test_mode) echo $tweet . "<br />";
            
            // Finally, get all words with four or more letters - @users and #hashtags included.
            preg_match_all('/[@#]?[-\w\''.LCSPECIAL.UCSPECIAL.']{4,}/u', $tweet, $topics_words);
            if ($test_mode) echo $tweet . "<br />";

            // Bunch everything together in $topics_words
            if (isset($topics_replynames)) $topics_words[0] = array_merge($topics_words[0], $topics_replynames[0]);

            // Now let's fill $TT. 
            // URLs and expressions go straight in and are counted as inserted.
            foreach(array_unique($topics_expressions[0]) as $item){
                if (isset($TT['expressions'][$item]))
                        $TT['expressions'][$item]++;
                else $TT['expressions'][$item] = 1;
            }

            // Other terms are separated into hashtags, usernames, upper and lowercase words.
            foreach(array_unique($topics_words[0]) as $item){
                if(!is_numeric($item)){
                    if (mb_substr($item,0,1) == '#') $type = 'hashtags';
                    else if (mb_substr($item,0,1) == '@') $type = 'usernames';
                    else if (mb_substr($item,0,1,'UTF-8') == mb_strtoupper(mb_substr($item,0,1,'UTF-8'),'UTF-8')) $type = 'UCwords';
                    else $type = 'LCwords';	
                    
                    if ($type == 'hashtags' || $type == 'usernames') 
                        $item = mb_strtolower($item,'UTF-8'); // those are inserted/counted in their lowercase version
                    if (isset($TT[$type][$item]))
                        $TT[$type][$item]++;
                    else $TT[$type][$item] = 1;
                }
            }
            $tweet_count++;
        }

        // Do we have more pages?
        if (!isset($JSONdata['search_metadata']['next_results']) || $tweet_count == 0)
            break; 
        else 
            $url = $base_url . $JSONdata['search_metadata']['next_results'];
        $pages_done++;
    } while (($pages_done < $max_pages) && ($timeframe < $max_timeframe));

    // So, how hard did we work?
    $TT['METADATA']['tweets'] = $tweets_received;
    $TT['METADATA']['timeframe'] = ($timeframe/60);
    $TT['METADATA']['min_id'] = $oldest_id;
    $TT['METADATA']['time_elapsed'] = (microtime(true) - $start_time);
    
    if ($test_mode){
        print_r($TT);
        die;
    }
    
    // Fly now, tallied and tailored data, and see the world.
    header('Content-type: application/json');
    echo json_encode($TT);
?>