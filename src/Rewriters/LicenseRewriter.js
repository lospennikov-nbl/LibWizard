// MIT License

// Copyright 2017 Electric Imp

// SPDX-License-Identifier: MIT

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
// EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
// OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
// ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
// OTHER DEALINGS IN THE SOFTWARE.

'use strict';


const fs = require('fs');
const path = require('path');
const minimatch = require('minimatch');


const AbstractRewriter = require('./AbstractRewriter');
const RewriterWarning = AbstractRewriter.Warning;

const LICENSE_FILE_PATH = './resources/LICENSE.example';


class LicenseRewriterWarning extends RewriterWarning {

  constructor(message, file) {
    super(message, file, 'LicenseRewriter');
  }

  toString() {
    return super.toString();
  }
};

class LicenseRewriter extends AbstractRewriter {

  constructor(exclude) {
    super();
    this.excludeList = exclude;
    this._extensionsSet = new Set(['.js', '.nut']);
  }

  /**
   * Check path for License mistakes
   * @param {string} path
   * @return {[CheckerWarning]}
   */
  rewrite(dirpath) {
    const files = this._getFiles(dirpath, []);
    const errors = [];
    for (const i in files) {
      const parsedPath = path.parse(files[i]);
      if (this._extensionsSet.has(parsedPath.ext)) {
        errors.push(this._rewriteSourceFile(files[i]));
      }
    }
    errors.push(this._rewriteLicenseFile());
    return errors.filter((error) => error != false);
  }

  _rewriteLicenseFile() {
    const filepath = 'LICENSE';
    fs.writeFileSync(filepath, this._getNewLicense('', ''), 'utf-8');
    return new LicenseRewriterWarning('New LICENSE file generated', filepath);
  }

  _rewriteSourceFile(filepath) {
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split(/\n/);
    let head = '';
    const licenseLines = [];
    let commentsType = '';
    let year = '';
    let i = 0;
    let headerIndex = 0;
    let hasLicense = false;

    for (i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (commentsType == '') {

        if (line == '') {
          continue;
        }

        if (line.startsWith('#!')) {
          head = line + '\n';
          headerIndex = i + 1;
          continue;
        } // skip shebang strings

        if (line.startsWith('//')) {
          commentsType = '//';
          year = this._findYear(line, year);
          hasLicense = hasLicense || this._findLicense(line);
          licenseLines.push(line.substring(2).trim());
        } else if (line.startsWith('/*')) {
          commentsType = '/*';
          year = this._findYear(line, year);
          hasLicense = hasLicense || this._findLicense(line);
          licenseLines.push(line.substring(2).trim());
        } else {
          break;
        }

      } else if (commentsType = '//') {

        if (line.startsWith('//')) {
          year = this._findYear(line, year);
          hasLicense = hasLicense || this._findLicense(line);
          licenseLines.push(line.substring(2).trim());
        } else {
          break; // end
        }

      } else if (commentsType = '/*') {
        year = this._findYear(line, year);
        hasLicense = hasLicense || this._findLicense(line);
        let index;
        if (index = line.indexOf('*/') > -1) {
          licenseLines.push(line.substring(0, index).trim());
          break;
        }
        if (line.startsWith('*')) {
          line = line.substring(1).trim();
        }
        licenseLines.push(line);

      }
    }

    if (!hasLicense) {
      const file = this._generateNewFile(lines.slice(headerIndex), '//', head, '');
      fs.writeFileSync(filepath, file, 'utf-8');
      return new LicenseRewriterWarning('file had no license, license was added', filepath);
    }
    const file = this._generateNewFile(lines.slice(i), commentsType, head, year);
    fs.writeFileSync(filepath, file, 'utf-8');
    return new LicenseRewriterWarning('license generated', filepath);
  }

  _findYear(line, year) {
    if (year) return year;
    const result = line.match(/(\d\d\d\d)(\-\d\d\d\d)?/);
    if (result) {
      return result[1];
    } else {
      return '';
    }
  }

  _findLicense(line) {
    return line.match(/license/i) != null;
  }

  _generateNewFile(lines, commentType, head, year) {
    let newFile = head + (head ? '\n' : '');
    newFile += this._getNewLicense(commentType, year);
    newFile += lines.reduce((prev, curr) => prev + '\n' + curr, '');
    return newFile;
  }

  _getNewLicense(commentType, year) {
    const currentYear = (new Date()).getFullYear();
    let yearString;
    if (year == '' || year == currentYear) {
      yearString = currentYear;
    } else {
      yearString = year + '-' + currentYear;
    }
    const originalLicense = fs.readFileSync(LICENSE_FILE_PATH, 'utf-8')
                              .replace('YYYY', yearString);
    if (commentType == '//') {
      const licLines = originalLicense.split('\n');
      if (licLines[licLines.length - 1] == '') {
        licLines.pop();
      }
      return  licLines.map(x => '//' + x)
                      .reduce((prev, curr) => prev + '\n' + curr);
    } else if (commentType == '/*') {
      return '/*' + originalLicense + '*/';
    } else {
      return originalLicense;
    }
  }

  _isExclude(filepath) {
    return this._excludeList.some((regexp) => regexp.test(filepath));
  }

  _getFiles(dir, allFiles) {
    const files = fs.readdirSync(dir);
    for (const i in files) {
      const name = dir + '/' + files[i];
      if (!this._isExclude(name)) {
        if (fs.statSync(name).isDirectory()) {
          this._getFiles(name, allFiles);
        } else {
          allFiles.push(name);
        }
      }
    }
    return allFiles;
  }

  get excludeList() {
    return this._excludeList;
  }

  /**
   * Construct exclude regexp list from filename
   * @param {JSON} settings for exclude file. '' for default
   */
  set excludeList(settings) {
    const filenames = settings.LicenseRewriter;
    // filters not empty strings, and makes regular expression from template
    const patterns = filenames.map((value) => value.trimLeft()) // trim for "is commented" check
      .filter((value) => (value != '' && value[0] != '#'))
      .map((value) => minimatch.makeRe(value));
    this._excludeList = patterns;
  }

}


module.exports.Warning = LicenseRewriterWarning;
module.exports  = LicenseRewriter;
