(function ($) {
    "use strict";

    // Spinner
    var spinner = function () {
        setTimeout(function () {
            if ($('#spinner').length > 0) {
                $('#spinner').removeClass('show');
            }
        }, 1);
    };
    spinner();
    
    
    // Initiate the wowjs
    new WOW().init();


    // Sticky Navbar
    $(window).scroll(function () {
        if ($(this).scrollTop() > 0) {
            $('.navbar').addClass('position-fixed bg-dark shadow-sm');
        } else {
            $('.navbar').removeClass('position-fixed bg-dark shadow-sm');
        }
    });
    
    
    // Back to top button
    $(window).scroll(function () {
        if ($(this).scrollTop() > 300) {
            $('.back-to-top').fadeIn('slow');
        } else {
            $('.back-to-top').fadeOut('slow');
        }
    });
    $('.back-to-top').click(function () {
        $('html, body').animate({scrollTop: 0}, 1500, 'easeInOutExpo');
        return false;
    });


    // Testimonials carousel (chargé uniquement sur les pages qui l'utilisent)
    if ($.fn.owlCarousel) {
        $('.testimonial-carousel').owlCarousel({
        autoplay: true,
        smartSpeed: 1000,
        loop: true,
        nav: false,
        dots: true,
        items: 1,
        dotsData: true,
        });
    }

    

    // Formulaire sans backend : jamais d'envoi (le texte saisi ne doit pas partir dans l'URL)
    $('form[data-no-backend]').on('submit', function (e) {
        e.preventDefault();
        var $note = $(this).find('.form-note');
        if (!$note.length) {
            $note = $('<p class="form-note text-primary mt-3 mb-0"></p>').appendTo(this);
        }
        $note.text("L'envoi de messages n'est pas encore activé sur ce site. Merci de nous contacter par téléphone ou par e-mail.");
    });

})(jQuery);
