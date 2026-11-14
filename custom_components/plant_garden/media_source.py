"""Plant photos as a media source (spec 6.3).

`ai_task` reads attachments through media sources and needs a local path, so
the photos stay under <config>/plant_garden/ and are not copied to /media.
In the media browser the garden shows its plants and their photos.
"""

from __future__ import annotations

from homeassistant.components.media_player import MediaClass
from homeassistant.components.media_source import (
    BrowseMediaSource,
    MediaSource,
    MediaSourceItem,
    PlayMedia,
    Unresolvable,
)
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .garden import NotFoundError
from .models import Photo
from .photos import PhotoVariant
from .runtime import get_manager
from .serialize import photo_urls

# medium: 1024 px WebP without any metadata, the size AI providers need
AI_VARIANT = PhotoVariant.MEDIUM


def _version(photo: Photo) -> str | None:
    return photo.edit.version if photo.edit else None


async def async_get_media_source(hass: HomeAssistant) -> MediaSource:
    return PlantPhotoSource(hass)


class PlantPhotoSource(MediaSource):
    name = "Plant Garden"

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(DOMAIN)
        self.hass = hass

    async def async_resolve_media(self, item: MediaSourceItem) -> PlayMedia:
        manager = get_manager(self.hass)
        if manager is None or not item.identifier:
            raise Unresolvable("Plant Garden is not loaded")
        try:
            photo = await manager.async_get_photo(item.identifier)
        except NotFoundError as err:
            raise Unresolvable(f"No photo {item.identifier}") from err
        url = photo_urls(self.hass, photo.id, None, _version(photo))[AI_VARIANT.value]
        return PlayMedia(url, "image/webp", path=manager.photo_path(photo, AI_VARIANT))

    async def async_browse_media(self, item: MediaSourceItem) -> BrowseMediaSource:
        manager = get_manager(self.hass)
        if manager is None:
            raise Unresolvable("Plant Garden is not loaded")
        if item.identifier:
            plant_id = item.identifier.removeprefix("plant/")
            try:
                plant = manager.get_plant(plant_id)
            except NotFoundError as err:
                raise Unresolvable(f"No plant {plant_id}") from err
            photos = await manager.async_list_photos(plant_id)
            children = [
                BrowseMediaSource(
                    domain=DOMAIN,
                    identifier=photo.id,
                    media_class=MediaClass.IMAGE,
                    media_content_type="image/webp",
                    title=photo.taken_at.date().isoformat(),
                    can_play=True,
                    can_expand=False,
                    thumbnail=photo_urls(self.hass, photo.id, None, _version(photo))[
                        PhotoVariant.THUMB.value
                    ],
                )
                for photo in photos
            ]
            return BrowseMediaSource(
                domain=DOMAIN,
                identifier=item.identifier,
                media_class=MediaClass.DIRECTORY,
                media_content_type="",
                title=plant.name,
                can_play=False,
                can_expand=True,
                children=children,
                children_media_class=MediaClass.IMAGE,
            )
        return BrowseMediaSource(
            domain=DOMAIN,
            identifier=None,
            media_class=MediaClass.DIRECTORY,
            media_content_type="",
            title=self.name,
            can_play=False,
            can_expand=True,
            children=[
                BrowseMediaSource(
                    domain=DOMAIN,
                    identifier=f"plant/{plant.id}",
                    media_class=MediaClass.DIRECTORY,
                    media_content_type="",
                    title=plant.name,
                    can_play=False,
                    can_expand=True,
                )
                for plant in manager.plants
            ],
            children_media_class=MediaClass.DIRECTORY,
        )
