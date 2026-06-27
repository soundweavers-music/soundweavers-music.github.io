from django.urls import path

from . import views


urlpatterns = [
    path("", views.home, name="home"),
    path("instruments/", views.instrument_list, name="instrument_list"),
    path("categories/<slug:slug>/", views.category_detail, name="instrument_category"),
    path("instruments/<int:pk>/", views.instrument_detail, name="instrument_detail"),
    path("popular/", views.popular_instruments, name="popular_instruments"),
    path("uncommon/", views.uncommon_instruments, name="uncommon_instruments"),
    path("random/", views.random_instrument, name="random_instrument"),
    path("about/", views.about, name="about"),
    path("theory/", views.theory, name="theory"),
]
