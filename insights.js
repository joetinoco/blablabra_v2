/**
 * BLABLABRA INSIGHTS CODE
 * =======================
 * Uses portions from https://github.com/watson-developer-cloud/personality-insights-nodejs
 * modified to display pluralized output ('you' is changed to 'them', etc).
 *
 * Original licence:
 * =================
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Converts a text to plural form ('you' is changed to 'them', etc).
function pluralize(text){
  var replacements = {
    'Yourself': 'Themselves',
    'yourself': 'themselves',
    'Your': 'Their',
    'your': 'their',
    'You': 'They',
    'you': 'they'
  };

  $.each(replacements, function (singular, plural){
    text = text.replace(new RegExp(singular,'g'),plural);
  });
  return text;
}

 /**
 * Construct a text representation for big5 traits crossing, facets and
 * values.
 */
function showTextSummary(data) {
  var paragraphs = [
    assembleTraits(data.tree.children[0]),
    assembleFacets(data.tree.children[0]),
    assembleNeeds(data.tree.children[1]),
    assembleValues(data.tree.children[2])
  ];
  var div = $('.summary-div');
  div.empty();
  paragraphs.forEach(function(sentences) {
    sentences = pluralize(sentences.join(' '));
    $('<p></p>').text(sentences).appendTo(div);
  });
}