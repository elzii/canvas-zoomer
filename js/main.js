

requirejs.config({
    baseUrl: 'js/modules',
    paths: {
      queue: 'queue',
      jquery: 'jquery',
      d3: 'd3',
      underscore: 'underscore'
    }
});

define('example', [
  'queue'
], function(queue) {

  function example() {
    this.name = 'Example';
  }
  
  return example;
});




// Start the main app logic.
define('zoomer', [
  'queue', 
  'jquery',
  'd3',
  'picture-book',
  'underscore',
], function(queue, $, d3, pictureBook, _) {

  console.log('pictureBook', new pictureBook())

  var config = c = {}

  var IMAGE_DIR = '/images/syria'
  
  
  var loadedImages = {};
  var imageList = getImageList()
  var pb = new pictureBook();
  


  function boot() {
    // mobile needs a bit more magnification, because of how
    // screen aspect ratios force image sizing.
    if (smallScreen) {
      startZoom.greenland = startZoom.greenland * 1.5;
      startZoom.moulins   = startZoom.moulins   * 1.5;
    };

    initZoomer('greenland');
    pb.init(bookScroll);
  }



  function bookScroll() {
    var b = pb.activeBook;

    if (lastActiveBook !== b) { // if book changed

      lastActiveBook = b;

      var zooms = [],
          foci  = [],
          positions = [];

      // push an array of page positions and their corresponding zooms
      _.each(b.pages, function(p) {
        positions.push(p.position);
        
        zooms.push(+p.node.getAttribute("data-pb-zoom"));

        var fX = +p.node.getAttribute("data-pb-focus-x"),
            fY = +p.node.getAttribute("data-pb-focus-y");

        foci.push([fX, fY]);

      })

      console.log('zooms', zooms)


      zoomScale  = d3.scale.linear().domain(positions).range(zooms).clamp(true);
      focusScale = d3.scale.linear().domain(positions).range(foci).clamp(true);



      // set the zoom directly if the book has changed
      // (this avoids 'animating' from the last book's zoom to the current.)
      zoom = smallScreen ? zoomScale(b.progress)*1.5 : zoomScale(b.progress);


      console.log(zoom, zooms, foci, positions)

      // start and end zoom for whole book.
      // var Zaa = +b.pages[0].node.getAttribute("data-pb-zoom"),
          // Zbb = +b.pages[b.pages.length-1].node.getAttribute("data-pb-zoom");
    }

    var Za = +b.minPage.node.getAttribute("data-pb-zoom"),
        Zb = +b.maxPage.node.getAttribute("data-pb-zoom");

    // targetZoom = Za + (Zb - Za) * (1 - b.remainder); // if using per-page remainders (leads to stairstepping)
    targetZoom  = zoomScale(b.progress); // if using d3 linear interp for book as a whole
    targetFocus = focusScale(b.progress);

    console.log(targetZoom, targetFocus, Za, Zb)

    // mobile needs a bit more magnification, because of how
    // screen aspect ratios force image sizing.
    if (smallScreen) targetZoom = targetZoom*1.5;
  }



  






  function initZoomer(slug) {
    var config = c = {};

    c.slug = slug;

    c.container = d3.select('#zoomer-'+slug);
    c.zoomer    = c.container.select(".g-zoomer");
    c.width     = parseInt(c.zoomer.style('width'));
    c.height    = parseInt(c.zoomer.style('height'));

    c.canvas    = c.zoomer.append("canvas")
      .datum(function() { return {'slug': slug }})
      .attr("width",   c.width)
      .attr("height",  c.height)
      .style("width",  c.width+'px')
      .style("height", c.height+'px');

    c.ctx = c.canvas.node().getContext('2d');

    loadZoomerImages(config);
  }


  function loadZoomerImages(config) {
    var slug = config.slug
    var q = queue(1)
    imageList[slug].forEach(function(t) {
      q.defer(loadImage, t);
    });
    q.awaitAll(imagesReady);

    function imagesReady(error, results) {
      console.log('imagesReady', error, results)
      ready(error, results, config)
    }
  }


  function ready(error, results, config) {
    animate(config)
  }



  function loadImage(t, cb) {
    // console.log('loadImage', t)
    var imagePath = IMAGE_DIR +'/'+ t.name;

    // to ensure images arent double-loaded when they show up in two zoomers
    if (loadedImages.hasOwnProperty(t.name)) {
      t.imageObj = loadedImages[t.name];
      cb(null,t);
    } else {

      var imageObj = new Image();
      imageObj.src = imagePath;
      t.imageObj = imageObj;
      loadedImages[t.name] = t.imageObj;

      imageObj.onload = function() { cb(null,t); };

    }
  }

  


  /**
   * ================================================================================
   * START
   * ================================================================================
   */
  var startZoom    = { 'greenland': 0.00304 },
      zoom         = 0.00304,
      targetZoom   = 0.00304,
      focus        = [0.5, 0.5],
      targetFocus  = [0.5, 0.5],
      drunkenness  = 0.015,
      mobileFocusY = 0.6;

  var zoomerConfigs = {};

  var lastActiveBook = '', zoomScale, zoomDir;
  var windowWidth = window.innerWidth;
  var smallScreen = windowWidth < 600 ? true : false;


  function animate(config) {
    // so that there's something on the canvas prior to scrolling into the thing

    draw(startZoom[config.slug], focus, config);

    function loop() {
      // only run through the loop if it's a loop for the book you're currently looking at.

      var atTarget = false;

      if (pb.activeBook && config.slug === pb.activeBook.slug && !atTarget) {

        var velocity = {
          z: (targetZoom - zoom),
          f: [ (targetFocus[0] - focus[0]) , (targetFocus[1] - focus[1]) ]
        };

        // no idea why this is necessary - use a different drunkenness if zooming out otherwise
        // it goes v e e r r r y y y s lll o o oo w w ll  yyy
        var drunk = velocity.z < 0 ? Math.pow(drunkenness,0.65) : drunkenness;

        velocity.z = velocity.z * drunk;
        velocity.f = [ ( velocity.f[0] * drunk ) , ( velocity.f[1] * drunk ) ];

        zoom  = zoom + velocity.z;
        focus = [ (focus[0] + velocity.f[0]) , (focus[1] + velocity.f[1]) ];

        draw(zoom, focus, config);
      }

      requestAnimationFrame(loop);

    }

    requestAnimationFrame(loop);
  }

  function draw(zoom, focus, config) {
    
    var slug   = config.slug,
        width  = config.width,
        height = config.height,
        ctx    = config.ctx;

    config.zoom = zoom;

    // console.log('DRAW '+slug + ' ' + zoom)

    // base scaling needs to change based on window aspect ratio,
    // to get a bg: "cover" effect (which helps avoid edges of images being visible)
    config.coverDim = window.innerWidth > window.innerHeight ? width : height;
    var coverDim = config.coverDim;

    var chosen = whichImagesToUse(zoom, slug);

    var hi = chosen.hiImage,
        lo = chosen.loImage,
        bg = chosen.bgImage;

    // console.log('hi', hi)
    // console.log('lo', lo)

    if (smallScreen) focus[1] = mobileFocusY;

    var pivot = [focus[0]*width, focus[1]*height]; // center of zoominess

    var motionBlurAmount = 0; // 0 to 1, lo to hi blur

    // stopgap for early in greenland zoomy when there's no image covering one part of the canvas
    // if (smallScreen && zoom < 0.02 && config.slug === 'syria') {
    //   ctx.fillStyle   = '#152735';
    //   ctx.fillRect(0, 0, width, height);
    // }


    // TODO rather than scaling entire image,
    // might be more efficient to cookie cut the subset of the image that I need
    // and then scale+draw that at full screen width
    // (so no overhang at edges)

    // only draw background image if the 'lo' image doesn't fully cover the screen.
    // ("covers the screen" would be zoom * scale === 1, but we're offsetting a bit on phones,
    // so use 1.2 to give some wiggle room.)
    var needBackground = zoom * lo.scale < 1.2 ? true : false;

    ctx.save();
    ctx.translate(pivot[0], pivot[1]);

    ctx.scale(zoom, zoom)

    // if (needBackground) {
    //   ctx.save();
    //     ctx.scale(bg.scale, bg.scale)
    //     ctx.globalAlpha = (1-motionBlurAmount);
    //     ctx.drawImage(bg.imageObj, -coverDim/2, -coverDim/2, coverDim, coverDim);
    //   ctx.restore();
    // }


    ctx.save();
      ctx.scale(lo.scale, lo.scale)
      ctx.globalAlpha = (1-motionBlurAmount);
      ctx.drawImage(lo.imageObj, -coverDim/2, -coverDim/2, coverDim, coverDim);
    ctx.restore();


    ctx.save();
      ctx.scale(hi.scale, hi.scale)
      ctx.globalAlpha = chosen.progress*(1-motionBlurAmount);
      ctx.drawImage(hi.imageObj, -coverDim/2, -coverDim/2, coverDim, coverDim);

      // ctx.strokeStyle = '#f00'; 
      // ctx.lineWidth = 20;        
      // ctx.strokeRect(-coverDim/2, -coverDim/2, coverDim, coverDim);
    ctx.restore();


    ctx.restore();

    if (zoom < 0.02 && config.slug === 'greenland') {
      // console.log('drawGreenlandLabel', zoom)
    }

    // if (zoom > 0.02 && config.slug === 'greenland') {
    //   drawScaleBox(config);
    // }
  }



  function whichImagesToUse(curZoom, slug) {
    var loImage, bgImage, hiImage, lowestSeen, highestSeen, progress;

    // todo maybe fix this 90%ing of curZoom?
    // it's a hacky fix to keep the "background", zoomed out image at a given zoom level
    // from disappearing too soon (before it's fully occluded by the next closest image)

    curZoom *= 0.90;

    _.each(imageList[slug],function(i) {
      var showAt = i.showAt = 1/i.scale;

      var distance = Math.abs(showAt-curZoom);

      var loUndefined = typeof loImage === 'undefined',
          bgUndefined = typeof bgImage === 'undefined',
          hiUndefined = typeof hiImage === 'undefined';

      if ( showAt <= curZoom && (loUndefined || distance < loImage.distance) ) {
        loImage = i;
        loImage.distance = distance;
        if (i-1 >= 0) {
          bgImage = i-1;
        }
      }
      if ( showAt >= curZoom && (hiUndefined || distance < hiImage.distance) ) {
        hiImage = i;
        hiImage.distance = distance;
      };

      if (loUndefined || showAt < lowestSeen.showAt) {
        lowestSeen = i;
        lowestSeen.distance = distance;
      };

      if (hiUndefined || showAt > highestSeen.showAt) {
        highestSeen = i;
        highestSeen.distance = distance;
      };

    });

    if (typeof loImage === 'undefined') loImage = lowestSeen;
    if (typeof bgImage === 'undefined') bgImage = lowestSeen;
    if (typeof hiImage === 'undefined') hiImage = highestSeen;

    progress = (curZoom-loImage.showAt)/(hiImage.showAt - loImage.showAt);

    progress = isNaN(progress)     ? 0 :
               !isFinite(progress) ? 1 :
               progress;

    return { loImage: loImage, bgImage: bgImage, hiImage: hiImage, progress: progress };
  }




  function getImageList() {
    return {
      'greenland': [
        // { 'name': 'z-0.00304.jpg',
        //   'scale': 1/0.00304  },
        // { 'name': 'z-0.00912.jpg',
        //   'scale': 1/0.00912  },
        // { 'name': 'z-0.0228.jpg',
        //   'scale': 1/0.0228  },
        // { 'name': 'z-0.12.jpg',
        //   'scale': 1/0.12  },
        // { 'name': 'z-0.2.jpg',
        //   'scale': 1/0.2  },
        // { 'name': 'z-1.jpg',
        //   'scale': 1/1  },
        // { 'name': 'z-3.560.jpg',
        //   'scale': 1/3.560  },
        // { 'name': 'z-15.221.jpg',
        //   'scale': 1/15.221  },
        // { 'name': 'z-50.351.jpg',
        //   'scale': 1/50.351  },
        // { 'name': 'z-124.568.jpg',
        //   'scale': 1/124.568  },

        { 'name': '09.jpg',
          'scale': 1/0.00304  },
        { 'name': '08.jpg',
          'scale': 1/0.00912  },
        { 'name': '07.jpg',
          'scale': 1/0.0228  },
        { 'name': '06.jpg',
          'scale': 1/0.12  },
        { 'name': '05.jpg',
          'scale': 1/0.2  },
        { 'name': '04.jpg',
          'scale': 1/1  },
        { 'name': '03.jpg',
          'scale': 1/3.560  },
        { 'name': '02.jpg',
          'scale': 1/15.221  },
        { 'name': '01.jpg',
          'scale': 1/50.351  },
        { 'name': '00.jpg',
          'scale': 1/124.568  },
      ]
    }
  }

  

  return boot;
});

















/**
 * Picture Book
 * @define picture-book
 */
define('picture-book', [], function() {

  var isIphone = /iPad|iPhone/.test(navigator.userAgent),
      isAndroid = /Android/.test(navigator.userAgent),
      isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/.test(navigator.userAgent),
      isLegacyMobile = checkLegacyMobile();

  function checkLegacyMobile() {
    return isMobile && !isModernMobile();
  }
  function isModernMobile() {
    return (navigator.userAgent.match(/(iPad|iPhone);.*CPU.*OS [8|9]_\d/i) && navigator.userAgent.indexOf("Safari") > -1 && navigator.userAgent.indexOf("CriOS") == -1)
           || navigator.userAgent.indexOf('Twitter') > -1;
  }

  return function(update) {

    var scrollYAtScan = 0,
        screenMeasure = 0.5;

    function getScrollY() {
      if (isLegacyMobile) return scroller.scrollTop;
      return scrollY;
    }

    this.init = function(update) {
      var that = this;
      this.books.forEach(function(book) {
        book.datum = [].slice.call(book.node.attributes)
          .filter(function(d) { return d.name.indexOf("data-pb-") === 0; })
          .map(function(d) { return {name: d.name.replace("data-pb-", ""), value: +d.value }; });
      });
      document.addEventListener("scroll", function() { that.scroll(); }, false);
      document.addEventListener("resize", function() { that.resize(); }, false);
      if (isLegacyMobile) {
        scroller.addEventListener("scroll", function() { that.scroll(); }, false);
        document.body.addEventListener("scroll", function() { that.scroll(); }, false);
        document.body.addEventListener("touchstart", function() { that.scroll(); }, false);
        document.body.addEventListener("touchmove", function() { that.scroll(); }, false);
        document.body.addEventListener("touchend", function() { that.scroll(); }, false);
      }

      that.update = update;
      that.scroll(); // just in case user starts in middle of the page, give it an initial scroll event
    }

    this.books = [].map.call(document.querySelectorAll(".g-picture-book"), function(d) {
      return {
        node: d,
        slug: d.getAttribute("data-slug"),
        bgNode: d.querySelector(".g-picture-book__bg"),
        pages: [].map.call(d.querySelectorAll(".g-picture-book__page"), function(page) { return {node: page}; })
      };
    });

    this.scroll = function() {
      // console.time("scroll");
      var that = this;
      var cachedScrollY = getScrollY();
      var isFixed = false;
      var anyActiveBook = false;
      this.scan(); //XXX TODO fix because nyt5 resizes the page randomly
      this.books.forEach(function(book, bi) {

        var topDistance    = cachedScrollY - scrollYAtScan - book.rect.top,
            bottomDistance = cachedScrollY - scrollYAtScan - book.rect.bottom + book.bgRect.height;

        // book.progress=(topDistance-book.bgRect.height/2)/(book.rect.height-book.bgRect.height*2);

          /*
          if (book.slug === 'greenland') {
            console.log('');
            console.log(topDistance);
            console.log(bottomDistance);
            console.log(topDistance-bottomDistance);
            console.log(book.progress);
          }
          */
          // book.progress = (topDistance-bottomDistance)/2/(book.rect.height-book.bgRect.height-firstPage.rect.top-lastPage.rect.bottom);

        // Background fixing
        // Top
        if (topDistance <= 0 && bottomDistance <= 0) {
          book.bgNode.classList.remove("g-fixed");
          book.bgNode.classList.remove("g-bottom");
          if (isLegacyMobile) book.node.querySelector(".g-zoomer-wrap").appendChild(book.bgNode);
        // Bottom
        } else if (bottomDistance > 0) {
          book.bgNode.classList.remove("g-fixed");
          book.bgNode.classList.add("g-bottom");
          if (isLegacyMobile) book.node.querySelector(".g-zoomer-wrap").appendChild(book.bgNode);
        // Fixed
        } else {
          that.activeBook = book;
          anyActiveBook = true;
          isFixed = true;
          if (isLegacyMobile) document.querySelector(".ftscroller_container").appendChild(book.bgNode);
          book.bgNode.classList.add("g-fixed");
          book.bgNode.classList.remove("g-bottom");

          // Pages
          if (book.pages.length) {

            var fp = book.pages[0];
            var lp = book.pages[book.pages.length-1];

            fp.pxPosition = fp.rect.middle-book.rect.top;
            lp.pxPosition = lp.rect.middle-book.rect.top;

            var bookProgressPx = topDistance - fp.pxPosition + book.bgRect.height/2;
            var bookLengthPx   = (book.rect.height - fp.pxPosition) - (book.rect.height-lp.pxPosition);

            book.progress = bookProgressPx/bookLengthPx;

            book.minIndex = 0;
            book.pages.forEach(function(page, pi) {

              var topDistance    = cachedScrollY - scrollYAtScan - page.rect.top    + innerHeight * screenMeasure,
                  midDistance    = cachedScrollY - scrollYAtScan - (page.rect.top+page.rect.height/2) + innerHeight * screenMeasure,
                  bottomDistance = cachedScrollY - scrollYAtScan - page.rect.bottom + innerHeight * screenMeasure;

              page.progress = (page.rect.top+page.rect.height/2)/innerHeight;
              page.midDistance = midDistance;
              if (bottomDistance >= 0) {
                page.distance = bottomDistance;
                book.minIndex = pi;
              } else if (topDistance <= 0) {
                page.distance = topDistance;
              } else if (topDistance > 0 && bottomDistance < 0) {
                page.distance = 0;
                book.minIndex = pi;
              }
            });

            book.maxIndex  = Math.min(book.minIndex + 1, book.pages.length - 1);

            book.minPage   = book.pages[book.minIndex];
            book.maxPage   = book.pages[book.maxIndex];

            book.remainder = book.minIndex === book.maxIndex ? 0 : 1 - Math.max(0, - book.minPage.distance / (book.maxPage.distance - book.minPage.distance));
            book.middleRemainder = book.minIndex === book.maxIndex ? 0 : 1 - Math.max(0, book.minPage.midDistance / innerHeight );

            book.remainder = that.easeInOutQuad(book.remainder);

            that.activePage = book.minPage;
            that.update(that.activePage);

          }
        }

      });

      if (!anyActiveBook) that.activeBook = null;

      // console.timeEnd("scroll");
    };

    this.scan = function() {
      scrollYAtScan = getScrollY();
      this.books.forEach(function(book) {
        book.rect = book.node.getBoundingClientRect();
        book.bgRect = book.bgNode.getBoundingClientRect();
        book.pages.forEach(function(page) {
          page.rect = page.node.getBoundingClientRect();
          page.rect.middle = (page.rect.top+page.rect.height/2);

        });
          // book.progress=(topDistance-book.bgRect.height/2)/(book.rect.height-book.bgRect.height*2);
        var fp = book.pages[0];
        var lp = book.pages[book.pages.length-1];

        book.pages.forEach(function(page) {
          // page.position = (page.rect.middle-book.rect.top)/book.rect.height;
          page.position = (page.rect.middle-fp.rect.middle) / (lp.rect.middle-fp.rect.middle);
          page.node.setAttribute("data-pb-pos",page.position)
        })
      });
    }

    this.resize = function() {
      this.scan();
      this.scroll();
    }

    this.easeLinear = function(t) { return t; }
    this.easeInOutSinusoidal = function(t) { return (Math.sin(t * Math.PI - Math.PI / 2) + 1) / 2; }
    this.easeInQuad = function(t) { return t * t; }
    this.easeOutQuad = function(t) { return 1 - this.easeInQuad(1 - t); }
    this.easeInOutQuad = function(t) { return (t < 0.5) ? this.easeInQuad(t * 2) / 2 : 1 - this.easeInQuad((1 - t) * 2) / 2; }
    this.easeInCubic = function(t) { return Math.pow(t, 3); }
    this.easeOutCubic = function(t) { return 1 - this.easeInCubic(1 - t); }
    this.easeInOutCubic = function(t) { return (t < 0.5) ? this.easeInCubic(t * 2) / 2 : 1 - this.easeInCubic((1 - t) * 2) / 2; }

  }

});






require([
  'zoomer'
], function(zoomer) {
  


  zoomer()
})